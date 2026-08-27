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
        $stmt = $this->db->prepare("INSERT INTO departments (name, code, description, project_id) VALUES (?, ?, ?, ?) RETURNING *");
        $stmt->execute([$data['name'], $data['code'] ?? '', $data['description'] ?? '', $data['project_id']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateItem(string $table, int $id, array $data): ?array {
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
        $stmt = $this->db->prepare("UPDATE $table SET $sets, updated_at = NOW() WHERE id = ? RETURNING *");
        $values = array_values($data);
        $values[] = $id;
        $stmt->execute($values);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function deleteItem(string $table, int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM $table WHERE id = ?");
        return $stmt->execute([$id]);
    }
}
