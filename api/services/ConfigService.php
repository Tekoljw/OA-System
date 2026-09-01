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
    public function getSubjects(int $projectId, ?string $type = null, ?string $transactionTypeCode = null): array {
        return $this->repo->getSubjects($projectId, $type, $transactionTypeCode);
    }

    /** 一级流水类型：系统固定，只读 */
    public function getTransactionTypes(?string $direction = null): array {
        return $this->repo->getTransactionTypes($direction);
    }

    /** 借贷分类：系统固定，只读 */
    public function getLoanTypes(?string $direction = null): array {
        return $this->repo->getLoanTypes($direction);
    }

    /**
     * 只有「不衍生其他记录」的一级类型才有自建科目：
     * 主营收入 / 其他收入 / 营业支出 / 其他支出。
     * 衍生类（借贷、资产、股东）的二级选项来自各自的记录表，不走科目。
     */
    private function assertSubjectPoolAllowed(string $ttCode): array {
        $tt = $this->repo->findTransactionType($ttCode);
        if (!$tt) throw new \InvalidArgumentException('流水类型不存在：' . $ttCode);
        if ($tt['second_level'] !== 'subject') {
            throw new \InvalidArgumentException(
                sprintf('「%s」的二级选项来自%s，不能在此新增科目', $tt['name'],
                    ['loan_type' => '借贷分类', 'loan' => '借贷记录', 'asset_type' => '资产分类',
                     'asset' => '资产记录', 'shareholder' => '股东列表'][$tt['second_level']] ?? '其他记录')
            );
        }
        return $tt;
    }

    public function createSubject(array $data): array {
        if (empty($data['name'])) throw new \InvalidArgumentException('名称不能为空');
        if (empty($data['transaction_type_code'])) {
            throw new \InvalidArgumentException('必须指定所属流水类型');
        }
        $tt = $this->assertSubjectPoolAllowed($data['transaction_type_code']);
        // 收支方向由一级类型决定，不接受前端传入，避免出现「挂在支出类型下的收入科目」
        $data['type'] = $tt['direction'];
        $result = $this->repo->createSubject($data);
        $this->logActivity('create', 'subjects', (int)$result['id'],
            sprintf('创建科目「%s」(%s)', $data['name'], $data['type']),
            $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        return $result;
    }

    public function updateSubject(int $id, array $data): ?array {
        $projectId = (int)($data['project_id'] ?? 0);
        $cur = $this->repo->findSubject($id, $projectId);
        if (!$cur) return null;
        if (!empty($cur['is_system'])) {
            throw new \InvalidArgumentException('系统科目不可修改');
        }
        // 归属的一级类型和收支方向都不允许改：改了会让已有流水的二级选项凭空错位
        unset($data['transaction_type_code'], $data['type'], $data['is_system']);
        $result = $this->repo->updateItem('subjects', $id, $data, $projectId);
        if ($result) {
            $this->logActivity('update', 'subjects', $id,
                sprintf('更新科目 #%d', $id),
                $data['created_by'] ?? null, (int)($data['project_id'] ?? 0));
        }
        return $result;
    }

    public function deleteSubject(int $id, int $projectId = 0): bool {
        $cur = $this->repo->findSubject($id, $projectId);
        if ($cur && !empty($cur['is_system'])) {
            throw new \InvalidArgumentException('系统科目不可删除');
        }
        // 已被流水引用的科目不能删：删了历史流水就失去归类，报表对不上
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
