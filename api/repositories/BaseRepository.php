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
            $conditions = $this->sanitizeColumnNames($conditions);
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
            $conditions = $this->sanitizeColumnNames($conditions);
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

    /**
     * 校验列名合法性，防止 SQL 注入
     */
    protected function sanitizeColumnNames(array $data): array {
        $safe = [];
        foreach ($data as $key => $value) {
            if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $key)) {
                continue; // 跳过非法列名
            }
            $safe[$key] = self::normalizeValue($value);
        }
        return $safe;
    }

    /**
     * PDO 把 PHP 的 false 绑成空字符串，Postgres 的 boolean 列直接拒收，
     * 报出来是「数据库操作失败」—— 停用用户、关闭开关这类操作看着成功、实则没落库。
     * 统一转成 'true'/'false' 字面量。
     */
    protected static function normalizeValue($value) {
        return is_bool($value) ? ($value ? 'true' : 'false') : $value;
    }

    public function create(array $data): array {
        $data = $this->sanitizeColumnNames($data);
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        $columns = implode(', ', array_keys($data));
        $placeholders = implode(', ', array_fill(0, count($data), '?'));
        $stmt = $this->db->prepare("INSERT INTO {$this->table} ($columns) VALUES ($placeholders) RETURNING *");
        $stmt->execute(array_values($data));
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function update(int $id, array $data): ?array {
        $data = $this->sanitizeColumnNames($data);
        if (empty($data)) throw new \InvalidArgumentException('无有效字段');
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
        $stmt = $this->db->prepare("UPDATE {$this->table} SET $sets, updated_at = NOW() WHERE id = ? RETURNING *");
        $values = array_values($data);
        $values[] = $id;
        $stmt->execute($values);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    /**
     * 返回是否真的删到了行。
     * 注意不能直接返回 execute() —— 它只表示 SQL 执行成功，
     * 删除 0 行同样返回 true，会让调用方误报「删除成功」。
     */
    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM {$this->table} WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }
}
