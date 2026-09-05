<?php
require_once __DIR__ . '/../repositories/AccountRepository.php';

class AccountService {
    private AccountRepository $repo;
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->repo = new AccountRepository($db);
    }

    public function getAccounts(int $projectId, int $page = 1, int $limit = 50, ?string $currency = null, ?string $type = null): array {
        $accounts = $this->repo->findByProject($projectId, $page, $limit, $currency, $type);
        $total = $this->repo->countByProject($projectId, $currency, $type);
        return ['items' => $accounts, 'total' => $total];
    }

    public function createAccount(array $data): array {
        // trim 后再判空：empty(' ') 为 false，纯空格会被当成合法名称存进去，
        // 列表里显示为一片空白，用户既看不出是什么也搜不到。
        // 顺带把 trim 后的值写回，避免「同名但首尾空格不同」的重复记录。
        $data['name'] = trim((string)($data['name'] ?? ''));
        if ($data['name'] === '') throw new \InvalidArgumentException('账户名称不能为空');
        if (empty($data['account_type'])) throw new \InvalidArgumentException('账户类型不能为空');
        if (empty($data['currency_type'])) throw new \InvalidArgumentException('币种不能为空');
        if (empty($data['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        // 开户余额要同时落到 balance：此前只写 initial_balance，
        // 账户建出来余额是 0，任何支出都被判「余额不足」，
        // 而界面上明明填了开户金额
        // 校验要与「金额」一致地把话说清楚：
        // 此前 (float)'abc' 静默变成 0，用户以为开户金额填进去了；
        // 而超大数值直接撞 numeric(15,2) 溢出，返回一句没有信息量的
        // 「数据库操作失败」500，用户不知道是数太大还是别的毛病。
        $rawInitial = $data['initial_balance'] ?? 0;
        if ($rawInitial === '' || $rawInitial === null) $rawInitial = 0;
        if (!is_numeric($rawInitial)) {
            throw new \InvalidArgumentException('初始余额必须是数字');
        }
        $initial = round((float)$rawInitial, 2);
        if (!is_finite($initial)) throw new \InvalidArgumentException('初始余额必须是数字');
        if ($initial < 0) throw new \InvalidArgumentException('初始余额不能为负数');
        // balance 列是 numeric(15,2)，整数部分最多 13 位；
        // 与单笔流水一样卡在 9.99 亿，留足累加空间
        if ($initial > 999999999.99) {
            throw new \InvalidArgumentException('初始余额超出有效范围（最大 9.99 亿）');
        }
        $data['initial_balance'] = $initial;
        $data['balance'] = $initial;

        $account = $this->repo->create($data);

        $this->logActivity('create', 'accounts', (int)$account['id'],
            sprintf('创建账户「%s」(%s %s)', $data['name'], $data['currency_type'], $data['account_type']),
            $data['created_by'] ?? null, (int)$data['project_id']);

        return $account;
    }

    public function updateAccount(int $id, array $data, int $currentProjectId = 0): array {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');
        // 跨项目越权校验
        if ($currentProjectId > 0 && (int)$existing['project_id'] !== $currentProjectId) {
            throw new \RuntimeException('无权操作其他项目的账户');
        }
        // 字段白名单。此前把整个请求体交给仓储，于是一个 PUT 就能把 balance
        // 改成任意数字 —— 绕开全部审批与流水直接篡改余额，账实从此分离，
        // 审计日志里还只留下一句「更新账户」。
        // 余额只能由落账逻辑改动；initial_balance 是开户金额，一旦有流水就不该再动；
        // project_id 更不能改，否则账户会凭空跨到别的项目去。
        $allowed = [
            'name', 'account_number', 'description', 'account_type',
            'currency_type', 'bank_name', 'credit_limit', 'status', 'open_date',
        ];
        $rejected = array_diff(array_keys($data), $allowed);
        $safe = array_intersect_key($data, array_flip($allowed));
        if (!$safe) {
            throw new \InvalidArgumentException(
                $rejected
                    ? '这些字段不允许直接修改：' . implode('、', $rejected)
                    : '无有效的可修改字段'
            );
        }

        // 已有流水的账户不允许改币种：历史流水是按原币种记的，改了金额含义就变了
        if (isset($safe['currency_type']) && $safe['currency_type'] !== $existing['currency_type']) {
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE account_id = ?");
            $stmt->execute([$id]);
            if ((int)$stmt->fetchColumn() > 0) {
                throw new \InvalidArgumentException(
                    '该账户已有流水，不能修改币种。历史流水按原币种记账，改了金额含义就变了。'
                );
            }
        }

        $result = $this->repo->update($id, $safe);
        if (!$result) throw new \RuntimeException('更新失败');

        $changed = array_keys($safe);
        $this->logActivity('update', 'accounts', $id,
            sprintf('更新账户「%s」：%s', $existing['name'], implode('、', $changed)),
            $data['updated_by'] ?? null, (int)$existing['project_id']);

        return $result;
    }

    public function deleteAccount(int $id, int $currentProjectId = 0, ?int $userId = null): void {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');
        // 跨项目越权校验
        if ($currentProjectId > 0 && (int)$existing['project_id'] !== $currentProjectId) {
            throw new \RuntimeException('无权操作其他项目的账户');
        }

        // 检查是否有关联交易，禁止删除有交易记录的账户
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE account_id = ?");
        $stmt->execute([$id]);
        $txCount = (int)$stmt->fetchColumn();
        if ($txCount > 0) {
            throw new \RuntimeException(sprintf('该账户下有 %d 条交易记录，无法删除。请先处理相关交易。', $txCount));
        }

        // 账上还有钱就不能销户。销户后该账户不再计入总资产，
        // 余额却仍挂在库里 —— 这笔钱在报表上凭空消失，对不上也查不着。
        $balance = (float)($existing['balance'] ?? 0);
        if (abs($balance) >= 0.01) {
            throw new \InvalidArgumentException(sprintf(
                '账户「%s」还有余额 %.2f，不能销户。请先划出或处理完余额。',
                $existing['name'], $balance
            ));
        }

        // 软删除：将状态改为 closed，保留历史数据
        $stmt = $this->db->prepare("UPDATE accounts SET status = 'closed', updated_at = NOW() WHERE id = ?");
        $stmt->execute([$id]);

        // 销户是不可逆操作，必须记下是谁做的 —— 此前这里写死 null，
        // 审计日志里只看得到「关闭了某账户」，看不到经手人
        $this->logActivity('delete', 'accounts', $id,
            sprintf('关闭账户「%s」', $existing['name']),
            $userId, (int)$existing['project_id']);
    }

    public function getAccountSummary(int $projectId): array {
        return $this->repo->getAccountSummary($projectId);
    }

    private function logActivity(string $action, string $targetType, int $targetId, string $description, ?int $userId, int $projectId): void {
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetType, $targetId, $description, $userId, $projectId]);
    }
}
