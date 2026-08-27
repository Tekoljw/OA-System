<?php
require_once __DIR__ . '/../repositories/AccountRepository.php';

class AccountService {
    private AccountRepository $repo;

    public function __construct(PDO $db) {
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

        return $this->repo->create($data);
    }

    public function updateAccount(int $id, array $data): array {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');
        $result = $this->repo->update($id, $data);
        if (!$result) throw new \RuntimeException('更新失败');
        return $result;
    }

    public function deleteAccount(int $id): void {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');
        $this->repo->delete($id);
    }

    public function getAccountSummary(int $projectId): array {
        return $this->repo->getAccountSummary($projectId);
    }
}
