<?php
/**
 * 数据访问基类
 * 提供通用的 CRUD 操作
 */
abstract class BaseRepository {
    protected PDO $db;
    protected string $table;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("SELECT * FROM {$this->table} WHERE id = ?");
        $stmt->execute([$id]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function findAll(array $conditions = [], int $page = 1, int $limit = 50): array {
        $where = '';
        $params = [];

        if (!empty($conditions)) {
            $clauses = [];
            foreach ($conditions as $key => $value) {
                $clauses[] = "$key = ?";
                $params[] = $value;
            }
            $where = 'WHERE ' . implode(' AND ', $clauses);
        }

        $offset = ($page - 1) * $limit;
        $stmt = $this->db->prepare("SELECT * FROM {$this->table} $where ORDER BY id DESC LIMIT ? OFFSET ?");
        $params[] = $limit;
        $params[] = $offset;
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function count(array $conditions = []): int {
        $where = '';
        $params = [];

        if (!empty($conditions)) {
            $clauses = [];
            foreach ($conditions as $key => $value) {
                $clauses[] = "$key = ?";
                $params[] = $value;
            }
            $where = 'WHERE ' . implode(' AND ', $clauses);
        }

        $stmt = $this->db->prepare("SELECT COUNT(*) FROM {$this->table} $where");
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    public function create(array $data): array {
        $columns = implode(', ', array_keys($data));
        $placeholders = implode(', ', array_fill(0, count($data), '?'));
        $stmt = $this->db->prepare("INSERT INTO {$this->table} ($columns) VALUES ($placeholders) RETURNING *");
        $stmt->execute(array_values($data));
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function update(int $id, array $data): ?array {
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
        $stmt = $this->db->prepare("UPDATE {$this->table} SET $sets, updated_at = NOW() WHERE id = ? RETURNING *");
        $values = array_values($data);
        $values[] = $id;
        $stmt->execute($values);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM {$this->table} WHERE id = ?");
        return $stmt->execute([$id]);
    }
}
