<?php
require_once __DIR__ . '/../repositories/TransactionRepository.php';
require_once __DIR__ . '/../repositories/AccountRepository.php';

class TransactionService {
    private TransactionRepository $repo;
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->repo = new TransactionRepository($db);
    }

    public function getTransactions(int $projectId, array $filters = [], int $page = 1, int $limit = 50): array {
        return [
            'items' => $this->repo->findByProject($projectId, $filters, $page, $limit),
            'total' => $this->repo->countByProject($projectId, $filters)
        ];
    }

    /**
     * 创建交易并自动更新账户余额
     */
    public function createTransaction(array $data): array {
        // 金额验证：必须为正数
        if (!isset($data['amount']) || !is_numeric($data['amount']) || (float)$data['amount'] <= 0) {
            throw new \InvalidArgumentException('金额必须大于0');
        }
        if (empty($data['type'])) throw new \InvalidArgumentException('类型不能为空');
        // 交易类型白名单校验
        $allowedTypes = ['income', 'expense', 'transfer'];
        if (!in_array($data['type'], $allowedTypes)) {
            throw new \InvalidArgumentException('交易类型无效，仅支持: income, expense, transfer');
        }
        if (empty($data['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        if (!isset($data['transaction_date'])) {
            $data['transaction_date'] = date('Y-m-d');
        }
        if (!isset($data['status'])) {
            $data['status'] = 'completed';
        }

        $this->db->beginTransaction();
        try {
            $transaction = $this->repo->create($data);

            // 自动更新账户余额
            if (!empty($data['account_id'])) {
                $amount = (float)$data['amount'];
                if ($data['type'] === 'income') {
                    $this->updateAccountBalance((int)$data['account_id'], $amount);
                } elseif ($data['type'] === 'expense') {
                    $this->updateAccountBalance((int)$data['account_id'], -$amount);
                }
            }

            // 记录审计日志
            $this->logActivity(
                'create',
                'transactions',
                (int)$transaction['id'],
                sprintf('%s交易 ¥%s', $data['type'] === 'income' ? '收入' : '支出', number_format($data['amount'], 2)),
                $data['created_by'] ?? null,
                (int)$data['project_id']
            );

            $this->db->commit();
            return $transaction;
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * 内部划款：从一个账户转到另一个账户
     */
    public function createTransfer(array $data): array {
        if (!isset($data['amount']) || !is_numeric($data['amount']) || (float)$data['amount'] <= 0) {
            throw new \InvalidArgumentException('划款金额必须大于0');
        }
        if (empty($data['account_id'])) throw new \InvalidArgumentException('转出账户不能为空');
        if (empty($data['target_account_id'])) throw new \InvalidArgumentException('转入账户不能为空');
        if ($data['account_id'] == $data['target_account_id']) {
            throw new \InvalidArgumentException('转出和转入账户不能相同');
        }
        if (empty($data['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        $amount = (float)$data['amount'];
        $toAmount = isset($data['to_amount']) ? (float)$data['to_amount'] : $amount;
        $fees = isset($data['fees']) ? (float)$data['fees'] : 0;

        if (!isset($data['transaction_date'])) {
            $data['transaction_date'] = date('Y-m-d');
        }

        $this->db->beginTransaction();
        try {
            // 创建转出记录
            $outData = [
                'type' => 'transfer',
                'amount' => $amount,
                'description' => $data['description'] ?? '内部划款-转出',
                'account_id' => $data['account_id'],
                'subject_id' => $data['subject_id'] ?? null,
                'department_id' => $data['department_id'] ?? null,
                'transaction_date' => $data['transaction_date'],
                'status' => 'completed',
                'project_id' => $data['project_id'],
                'created_by' => $data['created_by'] ?? null,
            ];
            $outTx = $this->repo->create($outData);

            // 创建转入记录
            $inData = [
                'type' => 'transfer',
                'amount' => $toAmount,
                'description' => $data['description'] ?? '内部划款-转入',
                'account_id' => $data['target_account_id'],
                'subject_id' => $data['subject_id'] ?? null,
                'department_id' => $data['department_id'] ?? null,
                'transaction_date' => $data['transaction_date'],
                'status' => 'completed',
                'project_id' => $data['project_id'],
                'created_by' => $data['created_by'] ?? null,
            ];
            $inTx = $this->repo->create($inData);

            // 更新两个账户的余额
            $this->updateAccountBalance((int)$data['account_id'], -($amount + $fees));
            $this->updateAccountBalance((int)$data['target_account_id'], $toAmount);

            // 记录审计日志
            $this->logActivity(
                'transfer',
                'transactions',
                (int)$outTx['id'],
                sprintf('内部划款 ¥%s，手续费 ¥%s', number_format($amount, 2), number_format($fees, 2)),
                $data['created_by'] ?? null,
                (int)$data['project_id']
            );

            $this->db->commit();
            return [
                'out_transaction' => $outTx,
                'in_transaction' => $inTx,
                'amount' => $amount,
                'to_amount' => $toAmount,
                'fees' => $fees,
            ];
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * 更新账户余额
     */
    private function updateAccountBalance(int $accountId, float $delta): void {
        $stmt = $this->db->prepare("UPDATE accounts SET balance = balance + ?, updated_at = NOW() WHERE id = ?");
        $stmt->execute([$delta, $accountId]);
    }

    /**
     * 记录审计日志
     */
    private function logActivity(string $action, string $targetType, int $targetId, string $description, ?int $userId, int $projectId): void {
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetType, $targetId, $description, $userId, $projectId]);
    }

    public function getTransactionSummary(int $projectId, string $period = 'month'): array {
        return $this->repo->getTransactionSummary($projectId, $period);
    }

    public function getIncomeBySubject(int $projectId, string $period = 'month'): array {
        return $this->repo->getBySubject($projectId, 'income', $period);
    }

    public function getExpenseBySubject(int $projectId, string $period = 'month'): array {
        return $this->repo->getBySubject($projectId, 'expense', $period);
    }

    public function getExpenseByDepartment(int $projectId, string $period = 'month'): array {
        return $this->repo->getByDepartment($projectId, $period);
    }
}
