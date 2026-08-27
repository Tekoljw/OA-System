<?php
require_once __DIR__ . '/../repositories/ConfigRepository.php';

class ConfigService {
    private ConfigRepository $repo;

    public function __construct(PDO $db) {
        $this->repo = new ConfigRepository($db);
    }

    // 币种
    public function getCurrencyTypes(int $projectId): array {
        return $this->repo->getCurrencyTypes($projectId);
    }

    public function createCurrencyType(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        if (empty($data['code'])) throw new \InvalidArgumentException('代码不能为空');
        return $this->repo->createCurrencyType($data);
    }

    public function updateCurrencyType(int $id, array $data): ?array {
        return $this->repo->updateItem('currency_types', $id, $data);
    }

    public function deleteCurrencyType(int $id): bool {
        return $this->repo->deleteItem('currency_types', $id);
    }

    // 账户类型
    public function getAccountTypes(int $projectId): array {
        return $this->repo->getAccountTypes($projectId);
    }

    public function createAccountType(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        return $this->repo->createAccountType($data);
    }

    public function updateAccountType(int $id, array $data): ?array {
        return $this->repo->updateItem('account_types', $id, $data);
    }

    public function deleteAccountType(int $id): bool {
        return $this->repo->deleteItem('account_types', $id);
    }

    // 科目
    public function getSubjects(int $projectId, ?string $type = null): array {
        return $this->repo->getSubjects($projectId, $type);
    }

    public function createSubject(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        if (empty($data['type'])) throw new \InvalidArgumentException('类型不能为空');
        return $this->repo->createSubject($data);
    }

    public function updateSubject(int $id, array $data): ?array {
        return $this->repo->updateItem('subjects', $id, $data);
    }

    public function deleteSubject(int $id): bool {
        return $this->repo->deleteItem('subjects', $id);
    }

    // 部门
    public function getAssetTypes(int $projectId): array {
        return $this->repo->getAssetTypes($projectId);
    }

    public function createAssetType(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        return $this->repo->createAssetType($data);
    }

    public function updateAssetType(int $id, array $data): ?array {
        return $this->repo->updateItem('asset_types', $id, $data);
    }

    public function deleteAssetType(int $id): bool {
        return $this->repo->deleteItem('asset_types', $id);
    }

    public function getDepartments(int $projectId): array {
        return $this->repo->getDepartments($projectId);
    }

    public function createDepartment(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        return $this->repo->createDepartment($data);
    }

    public function updateDepartment(int $id, array $data): ?array {
        return $this->repo->updateItem('departments', $id, $data);
    }

    public function deleteDepartment(int $id): bool {
        return $this->repo->deleteItem('departments', $id);
    }
}
