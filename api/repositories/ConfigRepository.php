<?php
require_once __DIR__ . '/BaseRepository.php';

class ConfigRepository extends BaseRepository {
    protected string $table = '';

    public function getCurrencyTypes(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM currency_types WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getAccountTypes(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM account_types WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getSubjects(int $projectId, ?string $type = null): array {
        $where = 'WHERE project_id = ?';
        $params = [$projectId];
        if ($type) {
            $where .= ' AND type = ?';
            $params[] = $type;
        }
        $stmt = $this->db->prepare("SELECT * FROM subjects $where ORDER BY id");
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getDepartments(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM departments WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function createCurrencyType(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO currency_types (name, code, description, project_id) VALUES (?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], $data['code'], $data['description'] ?? '', $data['project_id']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createAccountType(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO account_types (name, code, type, description, project_id) VALUES (?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], $data['code'] ?? '', $data['type'] ?? 'asset', $data['description'] ?? '', $data['project_id']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createSubject(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO subjects (name, code, type, description, project_id) VALUES (?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], $data['code'] ?? '', $data['type'], $data['description'] ?? '', $data['project_id']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function getAssetTypes(int $projectId): array {
        $stmt = $this->db->prepare("SELECT * FROM asset_types WHERE project_id = ? ORDER BY id");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function createAssetType(array $data): array {
        $stmt = $this->db->prepare("INSERT INTO asset_types (name, description, depreciation_rate, useful_life, project_id, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], $data['description'] ?? '', $data['depreciation_rate'] ?? 0, $data['useful_life'] ?? 0, $data['project_id'], $data['created_by'] ?? null]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createDepartment(array $data): array {
        // manager_id 此前被静默丢弃，导致前端选的部门主管从未落库
        $stmt = $this->db->prepare("INSERT INTO departments (name, code, description, project_id, manager_id) VALUES (?, ?, ?, ?, ?) RETURNING *");
        $stmt->execute([
            $data['name'], $data['code'] ?? '', $data['description'] ?? '', $data['project_id'],
            !empty($data['manager_id']) ? (int)$data['manager_id'] : null,
        ]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // 各表允许更新的列名白名单，防止 SQL 注入
    private const ALLOWED_COLUMNS = [
        'currency_types' => ['name', 'code', 'description', 'symbol'],
        'account_types'  => ['name', 'code', 'type', 'description'],
        'subjects'       => ['name', 'code', 'type', 'description'],
        'asset_types'    => ['name', 'description', 'depreciation_rate', 'useful_life'],
        'departments'    => ['name', 'code', 'description', 'manager_id'],
    ];

    public function updateItem(string $table, int $id, array $data, int $projectId = 0): ?array {
        // 移除不应直接更新的字段
        unset($data['project_id'], $data['created_by']);
        if (empty($data)) return null;

        // 仅保留白名单中的列，防止通过 JSON key 注入 SQL
        $allowed = self::ALLOWED_COLUMNS[$table] ?? [];
        $safeData = [];
        foreach ($data as $k => $v) {
            if (in_array($k, $allowed, true)) {
                $safeData[$k] = $v;
            }
        }
        if (empty($safeData)) return null;

        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($safeData)));
        // 加 project_id 约束，防止跨项目操作
        $sql = "UPDATE $table SET $sets, updated_at = NOW() WHERE id = ?";
        $values = array_values($safeData);
        $values[] = $id;
        if ($projectId > 0) {
            $sql .= " AND project_id = ?";
            $values[] = $projectId;
        }
        $sql .= " RETURNING *";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($values);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function deleteItem(string $table, int $id, int $projectId = 0): bool {
        $sql = "DELETE FROM $table WHERE id = ?";
        $params = [$id];
        if ($projectId > 0) {
            $sql .= " AND project_id = ?";
            $params[] = $projectId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount() > 0;
    }
}
