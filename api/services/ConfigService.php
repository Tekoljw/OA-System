<?php
require_once __DIR__ . '/../repositories/ConfigRepository.php';

class ConfigService {
    private ConfigRepository $repo;
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->repo = new ConfigRepository($db);
    }

    // 币种
    public function getCurrencyTypes(int $projectId): array {
        return $this->repo->getCurrencyTypes($projectId);
    }

    public function createCurrencyType(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        if (empty($data['code'])) throw new \InvalidArgumentException('代码不能为空');
        $result = $this->repo->createCurrencyType($data);
        $this->logActivity('create', 'currency_types', (int)$result['id'],
            sprintf('创建币种「%s」(%s)', $data['name'], $data['code']),
            $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        return $result;
    }

    public function updateCurrencyType(int $id, array $data): ?array {
        $result = $this->repo->updateItem('currency_types', $id, $data, (int)($data['project_id'] ?? 0));
        if ($result) {
            $this->logActivity('update', 'currency_types', $id,
                sprintf('更新币种 #%d', $id),
                $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        }
        return $result;
    }

    public function deleteCurrencyType(int $id, int $projectId = 0): bool {
        $ok = $this->repo->deleteItem('currency_types', $id, $projectId);
        if ($ok) {
            $this->logActivity('delete', 'currency_types', $id,
                sprintf('删除币种 #%d', $id), null, $projectId);
        }
        return $ok;
    }

    // 账户类型
    public function getAccountTypes(int $projectId): array {
        return $this->repo->getAccountTypes($projectId);
    }

    public function createAccountType(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        $result = $this->repo->createAccountType($data);
        $this->logActivity('create', 'account_types', (int)$result['id'],
            sprintf('创建账户类型「%s」', $data['name']),
            $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        return $result;
    }

    public function updateAccountType(int $id, array $data): ?array {
        $result = $this->repo->updateItem('account_types', $id, $data, (int)($data['project_id'] ?? 0));
        if ($result) {
            $this->logActivity('update', 'account_types', $id,
                sprintf('更新账户类型 #%d', $id),
                $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        }
        return $result;
    }

    public function deleteAccountType(int $id, int $projectId = 0): bool {
        $ok = $this->repo->deleteItem('account_types', $id, $projectId);
        if ($ok) {
            $this->logActivity('delete', 'account_types', $id,
                sprintf('删除账户类型 #%d', $id), null, $projectId);
        }
        return $ok;
    }

    // 科目
    public function getSubjects(int $projectId, ?string $type = null): array {
        return $this->repo->getSubjects($projectId, $type);
    }

    public function createSubject(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        if (empty($data['type'])) throw new \InvalidArgumentException('类型不能为空');
        $allowedSubjectTypes = ['income', 'expense'];
        if (!in_array($data['type'], $allowedSubjectTypes, true)) {
            throw new \InvalidArgumentException('科目类型无效，仅支持: income, expense');
        }
        $result = $this->repo->createSubject($data);
        $this->logActivity('create', 'subjects', (int)$result['id'],
            sprintf('创建科目「%s」(%s)', $data['name'], $data['type']),
            $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        return $result;
    }

    public function updateSubject(int $id, array $data): ?array {
        $result = $this->repo->updateItem('subjects', $id, $data, (int)($data['project_id'] ?? 0));
        if ($result) {
            $this->logActivity('update', 'subjects', $id,
                sprintf('更新科目 #%d', $id),
                $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        }
        return $result;
    }

    public function deleteSubject(int $id, int $projectId = 0): bool {
        // 检查是否有关联交易
        $this->checkTransactionReference('subject_id', $id, '科目');
        $ok = $this->repo->deleteItem('subjects', $id, $projectId);
        if ($ok) {
            $this->logActivity('delete', 'subjects', $id,
                sprintf('删除科目 #%d', $id), null, $projectId);
        }
        return $ok;
    }

    // 资产类型
    public function getAssetTypes(int $projectId): array {
        return $this->repo->getAssetTypes($projectId);
    }

    public function createAssetType(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        $result = $this->repo->createAssetType($data);
        $this->logActivity('create', 'asset_types', (int)$result['id'],
            sprintf('创建资产类型「%s」', $data['name']),
            $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        return $result;
    }

    public function updateAssetType(int $id, array $data): ?array {
        $result = $this->repo->updateItem('asset_types', $id, $data, (int)($data['project_id'] ?? 0));
        if ($result) {
            $this->logActivity('update', 'asset_types', $id,
                sprintf('更新资产类型 #%d', $id),
                $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        }
        return $result;
    }

    public function deleteAssetType(int $id, int $projectId = 0): bool {
        $ok = $this->repo->deleteItem('asset_types', $id, $projectId);
        if ($ok) {
            $this->logActivity('delete', 'asset_types', $id,
                sprintf('删除资产类型 #%d', $id), null, $projectId);
        }
        return $ok;
    }

    // 部门
    public function getDepartments(int $projectId): array {
        return $this->repo->getDepartments($projectId);
    }

    public function createDepartment(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        $result = $this->repo->createDepartment($data);
        $this->logActivity('create', 'departments', (int)$result['id'],
            sprintf('创建部门「%s」', $data['name']),
            $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        return $result;
    }

    public function updateDepartment(int $id, array $data): ?array {
        $result = $this->repo->updateItem('departments', $id, $data, (int)($data['project_id'] ?? 0));
        if ($result) {
            $this->logActivity('update', 'departments', $id,
                sprintf('更新部门 #%d', $id),
                $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        }
        return $result;
    }

    public function deleteDepartment(int $id, int $projectId = 0): bool {
        // 检查是否有关联交易
        $this->checkTransactionReference('department_id', $id, '部门');
        $ok = $this->repo->deleteItem('departments', $id, $projectId);
        if ($ok) {
            $this->logActivity('delete', 'departments', $id,
                sprintf('删除部门 #%d', $id), null, $projectId);
        }
        return $ok;
    }

    /**
     * 检查配置项是否被交易引用，有引用则禁止删除
     */
    private function checkTransactionReference(string $column, int $id, string $label): void {
        // 列名白名单防止注入
        $allowed = ['subject_id', 'department_id'];
        if (!in_array($column, $allowed, true)) return;

        $stmt = $this->db->prepare("SELECT COUNT(*) FROM transactions WHERE $column = ?");
        $stmt->execute([$id]);
        $count = (int)$stmt->fetchColumn();
        if ($count > 0) {
            throw new \RuntimeException(sprintf('该%s下有 %d 条交易记录，无法删除', $label, $count));
        }
    }

    private function logActivity(string $action, string $targetType, int $targetId, string $description, ?int $userId, int $projectId): void {
        if ($projectId <= 0) return; // 无有效项目ID时跳过日志
        $stmt = $this->db->prepare(
            "INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$action, $targetType, $targetId, $description, $userId, $projectId]);
    }
}
