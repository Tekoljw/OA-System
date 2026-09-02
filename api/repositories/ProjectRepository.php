<?php
require_once __DIR__ . '/BaseRepository.php';

class ProjectRepository extends BaseRepository {
    protected string $table = 'projects';

    private const ALLOWED_FIELDS = ['name', 'code', 'description', 'active'];

    private function filterFields(array $data): array {
        return array_intersect_key($data, array_flip(self::ALLOWED_FIELDS));
    }

    public function create(array $data): array {
        $data = $this->filterFields($data);
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');

        $ownsTx = !$this->db->inTransaction();
        if ($ownsTx) $this->db->beginTransaction();
        try {
            $project = parent::create($data);
            $this->seedBaseConfig((int)$project['id']);
            if ($ownsTx) $this->db->commit();
            return $project;
        } catch (\Exception $e) {
            if ($ownsTx) $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * 新项目的基础配置。
     *
     * 建项目原先只写一行 projects，什么都不初始化：没有币种就选不了账户币种、
     * 账户根本建不出来；本位币 USD 也没有汇率记录，凡是要换算的地方一律「汇率已失效」。
     * 这里只铺最低限度的东西，其余交给用户自己配 —— 尤其是部门，
     * 系统代建的部门没有主管，反而会让人以为审批链已经可用。
     */
    private function seedBaseConfig(int $projectId): void {
        // 币种：USD 是换算锚点，必须存在且恒为 1；CNY 打开自动取价
        $cur = $this->db->prepare(
            "INSERT INTO currency_types
                (name, code, description, project_id, rate_to_usd, auto_fetch, valid_hours, rate_updated_at, rate_source)
             VALUES (?,?,?,?,?,?,?,?,?)"
        );
        $cur->execute(['美元', 'USD', '美国法定货币', $projectId, 1, 'false', 24, date('Y-m-d H:i:s'), 'anchor']);
        $cur->execute(['人民币', 'CNY', '中国法定货币', $projectId, null, 'true', 24, null, null]);

        // 账户类型
        $at = $this->db->prepare(
            "INSERT INTO account_types (name, code, description, project_id) VALUES (?,?,?,?)"
        );
        foreach ([
            ['活期账户', 'current',    '日常收支使用的活期账户'],
            ['定期账户', 'fixed',      '定期存款账户'],
            ['信用卡',   'credit',     '信用卡账户'],
            ['投资账户', 'investment', '投资理财账户'],
        ] as [$name, $code, $desc]) {
            $at->execute([$name, $code, $desc, $projectId]);
        }

        // 四个不衍生其他记录的流水类型各配一个默认科目，
        // 否则提交主营收入这类申请时二级选项是空的
        $sub = $this->db->prepare(
            "INSERT INTO subjects (name, code, type, description, project_id, transaction_type_code)
             VALUES (?,?,?,?,?,?)"
        );
        foreach ([
            ['主营业务收入', 'main_default',      'income',  '主营收入的默认科目', 'main_income'],
            ['其他收入',     'other_inc_default', 'income',  '其他收入的默认科目', 'other_income'],
            ['日常营业支出', 'op_default',        'expense', '营业支出的默认科目', 'operating_expense'],
            ['其他支出',     'other_exp_default', 'expense', '其他支出的默认科目', 'other_expense'],
        ] as [$name, $code, $type, $desc, $tt]) {
            $sub->execute([$name, $code, $type, $desc, $projectId, $tt]);
        }
    }

    public function update(int $id, array $data): ?array {
        $data = $this->filterFields($data);
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        return parent::update($id, $data);
    }

    /**
     * 检查项目是否有关联数据（账户/交易），有则不可删除
     */
    public function hasAssociatedData(int $id): array {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM accounts WHERE project_id = ?");
        $stmt->execute([$id]);
        $accountCount = (int)$stmt->fetchColumn();

        $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE project_id = ?");
        $stmt->execute([$id]);
        $txCount = (int)$stmt->fetchColumn();

        return ['accounts' => $accountCount, 'transactions' => $txCount];
    }

    public function findActive(): array {
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE active = true ORDER BY id");
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findByCode(string $code): ?array {
        $stmt = $this->db->prepare("SELECT * FROM projects WHERE code = ?");
        $stmt->execute([$code]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }
}
