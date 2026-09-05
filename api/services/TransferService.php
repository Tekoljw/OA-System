<?php
require_once __DIR__ . '/ApprovalService.php';
require_once __DIR__ . '/TransactionService.php';

/**
 * 内部划款单服务
 *
 * 与申请单共用审批引擎。关键约束：审批期间不动账户余额，
 * 只有 execute() 才调用 TransactionService::createTransfer 落账，
 * 由后者在事务内加锁校验余额，防止并发超支。
 */
class TransferService {
    private PDO $db;
    private ApprovalService $approval;

    public function __construct(PDO $db) {
        $this->db       = $db;
        $this->approval = new ApprovalService($db);
    }

    public function getTransfers(int $projectId, array $q): array {
        $where  = ['t.project_id = ?'];
        $params = [$projectId];

        $status = $q['status'] ?? 'all';
        if ($status !== 'all') {
            $map = [
                'pending'         => ['pending'],
                'approved'        => ['approved', 'to_be_executed'],
                'to_be_executed'  => ['to_be_executed', 'approved'],
                'rejected'        => ['rejected'],
                'completed'       => ['completed'],
            ];
            if (!isset($map[$status])) throw new \InvalidArgumentException('无效的状态参数: ' . $status);
            $place   = implode(',', array_fill(0, count($map[$status]), '?'));
            $where[] = "t.status IN ($place)";
            $params  = array_merge($params, $map[$status]);
        }

        // 关键字搜索：服务端此前没有实现，前端传了 search 也被忽略，
        // 搜什么都返回全部，本地过滤又只能覆盖当前这一页
        if (!empty($q['search'])) {
            $where[] = '(fa.name ILIKE ? OR ta.name ILIKE ? OR su.full_name ILIKE ?
                         OR t.reason ILIKE ? OR CAST(t.id AS TEXT) = ?)';
            $kw = '%' . $q['search'] . '%';
            array_push($params, $kw, $kw, $kw, $kw, (string)$q['search']);
        }
        if (!empty($q['date'])) {
            $where[]  = "t.created_at::date = ?";
            $params[] = $q['date'];
        }

        $page  = max(1, (int)($q['page'] ?? 1));
        $limit = (($__l = (int)($q['limit'] ?? 50)) > 0 ? min(200, $__l) : 50);
        $whereStr = implode(' AND ', $where);

        // 计数与列表共用同一套 JOIN：搜索条件涉及 accounts / users 上的字段，
        // 计数若不带 JOIN 就会算出与列表不一致的总数，分页随之出错
        $fromClause = "
            FROM transfers t
            LEFT JOIN accounts fa ON t.from_account_id = fa.id
            LEFT JOIN accounts ta ON t.to_account_id   = ta.id
            LEFT JOIN users su    ON t.submitter_id    = su.id
            LEFT JOIN users au    ON t.executed_by     = au.id";

        $stmt = $this->db->prepare("
            SELECT t.*, fa.name AS from_account_name, fa.currency_type AS from_currency,
                   ta.name AS to_account_name,  ta.currency_type AS to_currency,
                   su.full_name AS submitter_name, au.full_name AS approver_name
            $fromClause
            WHERE $whereStr ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?
        ");
        $stmt->execute(array_merge($params, [$limit, ($page - 1) * $limit]));
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $cnt = $this->db->prepare("SELECT COUNT(*) $fromClause WHERE $whereStr");
        $cnt->execute($params);

        return [
            'transfers' => array_map([$this, 'toApiShape'], $rows),
            'total' => (int)$cnt->fetchColumn(),
            'page'  => $page,
            'limit' => $limit,
        ];
    }

    private function toApiShape(array $r): array {
        return [
            'id'                    => (string)$r['id'],
            'fromAccount'           => $r['from_account_name'] ?? '',
            'fromCurrency'          => $r['from_currency'] ?? '',
            'toAccount'             => $r['to_account_name'] ?? '',
            'toCurrency'            => $r['to_currency'] ?? '',
            'amount'                => (float)$r['amount'],
            'toAmount'              => (float)$r['to_amount'],
            'fees'                  => (float)$r['fees'],
            'exchangeLoss'          => (float)$r['exchange_loss'],
            'actualExchangeRate'    => $r['actual_exchange_rate'] !== null ? (float)$r['actual_exchange_rate'] : null,
            'officialExchangeRate'  => $r['official_exchange_rate'] !== null ? (float)$r['official_exchange_rate'] : null,
            'reason'                => $r['reason'],
            'status'                => $r['status'],
            'submitter'             => $r['submitter_name'] ?? '',
            // 截到秒：PG 时间戳带微秒，前端直接展示会出现 11:08:27.824239
            'submitTime'            => substr((string)$r['created_at'], 0, 19),
            'approver'              => $r['approver_name'] ?? '',
            'approveTime'           => $r['approved_at'] ? substr((string)$r['approved_at'], 0, 19) : null,
            'projectId'             => (int)$r['project_id'],
        ];
    }

    public function getTransfer(int $id, int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM transfers WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new \RuntimeException('划款单不存在');
        $shape = $this->toApiShape($row);
        $shape['approvals'] = $this->approval->getApprovals('transfer_id', $id);
        return $shape;
    }

    public function create(array $d): array {
        foreach (['from_account_id' => '转出账户', 'to_account_id' => '转入账户'] as $k => $label) {
            if (empty($d[$k])) throw new \InvalidArgumentException($label . '不能为空');
        }
        if ((int)$d['from_account_id'] === (int)$d['to_account_id']) {
            throw new \InvalidArgumentException('转出和转入账户不能相同');
        }
        if (!isset($d['amount']) || !is_numeric($d['amount']) || (float)$d['amount'] <= 0) {
            throw new \InvalidArgumentException('划款金额必须大于0');
        }
        // 金额列是 numeric(15,2)，超限或小于一分都会撞库约束，
        // 报给用户的是一整段 SQLSTATE 原文；上限此前根本没校验，10 亿也能提交
        if (round((float)$d['amount'], 2) < 0.01) {
            throw new \InvalidArgumentException('划款金额最小为 0.01');
        }
        if (!is_finite((float)$d['amount']) || (float)$d['amount'] > 999999999.99) {
            throw new \InvalidArgumentException('划款金额超出有效范围（最大 9.99 亿）');
        }
        $feeInput = $d['fees'] ?? 0;
        if (!is_numeric($feeInput) || (float)$feeInput < 0) {
            throw new \InvalidArgumentException('手续费不能为负数');
        }
        if ((float)$feeInput > 999999999.99) {
            throw new \InvalidArgumentException('手续费超出有效范围');
        }
        $projectId = (int)$d['project_id'];
        foreach (['from_account_id', 'to_account_id'] as $k) {
            $this->assertAccountInProject((int)$d[$k], $projectId);
        }

        // 币种一致性与汇率：同币种不许出现汇率差，跨币种必须有可用汇率
        $rateInfo = $this->resolveCurrency($d, $projectId);
        $d['to_amount']              = $rateInfo['to_amount'];
        $d['official_exchange_rate'] = $rateInfo['official_rate'];
        $d['actual_exchange_rate']   = $rateInfo['actual_rate'];
        $d['exchange_loss']          = $rateInfo['exchange_loss'];

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO transfers
                    (project_id, from_account_id, to_account_id, amount, to_amount, fees,
                     exchange_loss, actual_exchange_rate, official_exchange_rate,
                     reason, status, department_id, submitter_id)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?) RETURNING *
            ");
            $amount   = (float)$d['amount'];
            $toAmount = isset($d['to_amount']) ? (float)$d['to_amount'] : $amount;
            $stmt->execute([
                $projectId, (int)$d['from_account_id'], (int)$d['to_account_id'],
                $amount, $toAmount, (float)($d['fees'] ?? 0), (float)($d['exchange_loss'] ?? 0),
                $d['actual_exchange_rate']   ?? null,
                $d['official_exchange_rate'] ?? null,
                $d['reason'] ?? null,
                $d['department_id'] ?? null, $d['submitter_id'] ?? null,
            ]);
            $tr = $stmt->fetch(PDO::FETCH_ASSOC);

            $chain = $this->approval->createApprovalChain(
                'transfer_id', (int)$tr['id'], $projectId,
                isset($d['department_id']) ? (int)$d['department_id'] : null,
                $d['submitter_id'] ?? null, $amount, 'transfer'
            );
            $upd = $this->db->prepare("UPDATE transfers SET rule_id = ? WHERE id = ?");
            $upd->execute([$chain['rule_id'], (int)$tr['id']]);

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getTransfer((int)$tr['id'], $projectId);
    }

    public function act(int $id, int $projectId, string $decision, string $comment, array $user): array {
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            throw new \InvalidArgumentException('审批结果只能是 approved 或 rejected');
        }
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("SELECT * FROM transfers WHERE id = ? AND project_id = ? FOR UPDATE");
            $stmt->execute([$id, $projectId]);
            $tr = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$tr)                        throw new \RuntimeException('划款单不存在');
            if ($tr['status'] !== 'pending') throw new \RuntimeException('该划款单当前状态不可审批：' . $tr['status']);

            $step = (int)$tr['current_step'];
            $rows = $this->approval->getApprovals('transfer_id', $id);
            $curr = array_values(array_filter($rows, fn($r) => (int)$r['step_order'] === $step));
            if (!$curr) throw new \RuntimeException('审批节点不存在');

            $node = $curr[0];
            if (!$this->approval->canApprove($node, $user)) {
                throw new \RuntimeException('您没有该审批节点的审批权限');
            }
            foreach ($curr as $r) {
                if ((int)($r['approver_id'] ?? 0) === (int)$user['id']) {
                    throw new \RuntimeException('您已在该节点完成审批，不能重复审批');
                }
            }
            $slot = null;
            foreach ($curr as $r) { if ($r['status'] === 'pending') { $slot = $r; break; } }
            if (!$slot) throw new \RuntimeException('该节点已完成审批');

            $this->db->prepare(
                "UPDATE application_approvals SET status = ?, approver_id = ?, comment = ?, acted_at = NOW() WHERE id = ?"
            )->execute([$decision, $user['id'], $comment, $slot['id']]);

            if ($decision === 'rejected') {
                $this->db->prepare("UPDATE transfers SET status = 'rejected', updated_at = NOW() WHERE id = ?")->execute([$id]);
                $this->db->commit();
                return $this->getTransfer($id, $projectId);
            }

            $cnt = $this->db->prepare(
                "SELECT COUNT(*) FROM application_approvals WHERE transfer_id = ? AND step_order = ? AND status = 'approved'"
            );
            $cnt->execute([$id, $step]);
            $approvedCount = (int)$cnt->fetchColumn();
            $required      = (int)$node['required_count'];

            if ($approvedCount < $required) {
                $this->db->prepare(
                    "INSERT INTO application_approvals
                        (transfer_id, step_order, approver_type, candidate_role, candidate_user_id, required_count)
                     VALUES (?,?,?,?,?,?)"
                )->execute([$id, $step, $node['approver_type'], $node['candidate_role'],
                            $node['candidate_user_id'], $required]);
                $this->db->commit();
                return $this->getTransfer($id, $projectId);
            }

            $maxStep = 0;
            foreach ($rows as $r) { $maxStep = max($maxStep, (int)$r['step_order']); }

            if ($step < $maxStep) {
                $this->db->prepare("UPDATE transfers SET current_step = ?, updated_at = NOW() WHERE id = ?")
                         ->execute([$step + 1, $id]);
            } else {
                $this->db->prepare(
                    "UPDATE transfers SET status = 'to_be_executed', approved_at = NOW(), updated_at = NOW() WHERE id = ?"
                )->execute([$id]);
            }
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->getTransfer($id, $projectId);
    }

    /** 执行落账：复用 TransactionService::createTransfer（内含余额加锁校验） */
    public function execute(int $id, int $projectId, array $user): array {
        $stmt = $this->db->prepare("SELECT * FROM transfers WHERE id = ? AND project_id = ?");
        $stmt->execute([$id, $projectId]);
        $tr = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$tr) throw new \RuntimeException('划款单不存在');
        if (!in_array($tr['status'], ['to_be_executed', 'approved'], true)) {
            throw new \RuntimeException('该划款单当前状态不可执行：' . $tr['status']);
        }
        if (!empty($tr['out_transaction_id'])) {
            throw new \RuntimeException('该划款单已执行，不能重复执行');
        }

        $txService = new TransactionService($this->db);
        $result = $txService->createTransfer([
            'amount'            => (float)$tr['amount'],
            'to_amount'         => (float)$tr['to_amount'],
            'fees'              => (float)$tr['fees'],
            'account_id'        => (int)$tr['from_account_id'],
            'target_account_id' => (int)$tr['to_account_id'],
            'department_id'     => $tr['department_id'],
            'description'       => sprintf('[划款单#%d] %s', $id, $tr['reason'] ?? '内部划款'),
            'project_id'        => $projectId,
            'created_by'        => $user['id'],
        ]);

        $this->db->prepare(
            "UPDATE transfers SET status = 'completed', out_transaction_id = ?, in_transaction_id = ?,
             executed_at = NOW(), executed_by = ?, updated_at = NOW() WHERE id = ?"
        )->execute([
            (int)$result['out_transaction']['id'], (int)$result['in_transaction']['id'],
            (int)$user['id'], $id,
        ]);

        return $this->getTransfer($id, $projectId);
    }

    /**
     * 划款的币种与汇率。
     *
     * 手续费的口径：从转出账户额外扣除（转出方共扣 amount + fees），
     * 不从到账金额里扣。落账逻辑一直如此，这里必须与之一致。
     *
     * 同币种：到账金额只能等于转出金额，不存在汇率，也不该有汇兑损益。
     * 跨币种：必须给出实际到账金额，并按系统汇率算出官方应得，差额记为汇兑损益，
     *         便于事后看清这笔换汇是赚是亏。
     *
     * 任一币种汇率失效就直接拒绝：用失效汇率算出来的损益是假的，
     * 记进账本比不记更糟 —— 它看起来像是真的。
     */
    private function resolveCurrency(array $d, int $projectId): array {
        $from = $this->currencyOf((int)$d['from_account_id']);
        $to   = $this->currencyOf((int)$d['to_account_id']);
        $amount = (float)$d['amount'];
        $fees   = (float)($d['fees'] ?? 0);

        if ($from === $to) {
            if (isset($d['to_amount']) && (int)round((float)$d['to_amount'] * 100) !== (int)round($amount * 100)) {
                throw new \InvalidArgumentException(sprintf(
                    '同币种划款的到账金额必须等于转出金额 %.2f（手续费 %.2f 从转出账户另行扣除），不能自行填写',
                    $amount, $fees
                ));
            }
            return ['to_amount' => $amount, 'official_rate' => null, 'actual_rate' => null, 'exchange_loss' => 0.0];
        }

        if (!isset($d['to_amount']) || (float)$d['to_amount'] <= 0) {
            throw new \InvalidArgumentException(sprintf('%s → %s 为跨币种划款，必须填写实际到账金额', $from, $to));
        }
        $toAmount = (float)$d['to_amount'];

        require_once __DIR__ . '/ExchangeRateService.php';
        $rates = [];
        foreach ((new ExchangeRateService($this->db))->listRates($projectId) as $c) {
            $rates[$c['code']] = $c;
        }
        foreach ([$from, $to] as $code) {
            $r = $rates[$code] ?? null;
            if (!$r || $r['isExpired'] || !$r['rateToUsd']) {
                throw new \RuntimeException(sprintf(
                    '%s 的汇率已失效，无法核算这笔跨币种划款。请先在「配置管理 → 账户配置 → 币种管理」中更新汇率。',
                    $code
                ));
            }
        }

        // 官方汇率＝1 单位转出币折合多少转入币，两边都以 USD 为锚换算得到
        $officialRate = $rates[$from]['rateToUsd'] / $rates[$to]['rateToUsd'];
        // 手续费不参与换算：它从转出账户另扣，不影响这笔钱按汇率应换到多少
        $expected     = round($amount * $officialRate, 2);
        // 实际汇率按真实到账倒推，与官方汇率的差额就是汇兑损益
        $actualRate   = $amount > 0 ? $toAmount / $amount : 0;

        // 到账金额与官方汇率算出来的参考值偏差不得超过 50%。
        //
        // 此前完全不校验：实测 10000 CNY 填「到账 999999 USD」被照单全收并执行，
        // USD 账户凭空多出 99 万，那 99 万还被记成汇兑收益进了报表。
        // 到账金额是人工填的，多打或少打一个 0 是最常见的手滑。
        //
        // 阈值取得很宽（正常点差与手续费差异通常在 5% 以内，小币种极端行情
        // 也就 10~20%），只挡数量级错误，不干涉真实业务；错误信息里带上官方
        // 汇率与参考金额，用户能当场核对是自己填错还是汇率该更新了。
        if ($expected > 0) {
            $deviation = abs($toAmount - $expected) / $expected;
            if ($deviation > 0.5) {
                throw new \InvalidArgumentException(sprintf(
                    '到账金额 %.2f %s 与按官方汇率折算的 %.2f %s 相差 %.0f%%，请核对。'
                    . '（官方汇率 1 %s = %.6f %s；确属实际到账请先更新汇率）',
                    $toAmount, $to, $expected, $to, $deviation * 100,
                    $from, $officialRate, $to
                ));
            }
        }

        return [
            'to_amount'     => $toAmount,
            'official_rate' => round($officialRate, 8),
            'actual_rate'   => round($actualRate, 8),
            'exchange_loss' => round($expected - $toAmount, 2),
        ];
    }

    private function currencyOf(int $accountId): string {
        $stmt = $this->db->prepare("SELECT name, currency_type, status FROM accounts WHERE id = ?");
        $stmt->execute([$accountId]);
        $acc = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$acc) throw new \InvalidArgumentException('账户不存在');
        // 冻结/销户的账户不能参与划款
        if (($acc['status'] ?? 'active') !== 'active') {
            throw new \InvalidArgumentException(sprintf(
                '账户「%s」已停用，不能用于划款。请先启用该账户或改选其他账户。', $acc['name']
            ));
        }
        return (string)$acc['currency_type'];
    }

    private function assertAccountInProject(int $accountId, int $projectId): void {
        $stmt = $this->db->prepare("SELECT 1 FROM accounts WHERE id = ? AND project_id = ?");
        $stmt->execute([$accountId, $projectId]);
        if (!$stmt->fetch()) throw new \InvalidArgumentException('账户不存在或不属于当前项目');
    }
}
