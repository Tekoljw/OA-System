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
        $accounts = $this->repo->findByProject($projectId, $page, $limit);
        $total = $this->repo->countByProject($projectId);

        // 过滤
        if ($currency) {
            $accounts = array_filter($accounts, fn($a) => $a['currency_type'] === $currency);
        }
        if ($type) {
            $accounts = array_filter($accounts, fn($a) => $a['account_type'] === $type);
        }

        return ['items' => array_values($accounts), 'total' => $total];
    }

    public function createAccount(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('账户名称不能为空');
        if (empty($data['account_type'])) throw new \InvalidArgumentException('账户类型不能为空');
        if (empty($data['currency_type'])) throw new \InvalidArgumentException('币种不能为空');
        if (empty($data['project_id'])) throw new \InvalidArgumentException('项目ID不能为空');

        $account = $this->repo->create($data);

        $this->logActivity('create', 'accounts', (int)$account['id'],
            sprintf('创建账户「%s」(%s %s)', $data['name'], $data['currency_type'], $data['account_type']),
            $data['created_by'] ?? null, (int)$data['project_id']);

        return $account;
    }

    public function updateAccount(int $id, array $data): array {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');
        $result = $this->repo->update($id, $data);
        if (!$result) throw new \RuntimeException('更新失败');

        $this->logActivity('update', 'accounts', $id,
            sprintf('更新账户 #%d', $id),
            null, (int)$existing['project_id']);

        return $result;
    }

    public function deleteAccount(int $id): void {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');

        // 检查是否有关联交易，禁止删除有交易记录的账户
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE account_id = ?");
        $stmt->execute([$id]);
        $txCount = (int)$stmt->fetchColumn();
        if ($txCount > 0) {
            throw new \RuntimeException(sprintf('该账户下有 %d 条交易记录，无法删除。请先处理相关交易。', $txCount));
        }

        $this->repo->delete($id);

        $this->logActivity('delete', 'accounts', $id,
            sprintf('删除账户「%s」', $existing['name']),
            null, (int)$existing['project_id']);
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
