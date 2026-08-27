<?php
require_once __DIR__ . '/../repositories/TransactionRepository.php';

class TransactionService {
    private TransactionRepository $repo;

    public function __construct(PDO $db) {
        $this->repo = new TransactionRepository($db);
    }

    public function getTransactions(int $projectId, array $filters = [], int $page = 1, int $limit = 50): array {
        return [
            'items' => $this->repo->findByProject($projectId, $filters, $page, $limit),
            'total' => $this->repo->countByProject($projectId, $filters)
        ];
    }

    public function createTransaction(array $data): array {
        if (empty($data['amount'])) throw new \InvalidArgumentException('金额不能为空');
        if (empty($data['type'])) throw new \InvalidArgumentException('类型不能为空');
        if (empty($data['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        if (!isset($data['transaction_date'])) {
            $data['transaction_date'] = date('Y-m-d');
        }
        if (!isset($data['status'])) {
            $data['status'] = 'completed';
        }

        return $this->repo->create($data);
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
