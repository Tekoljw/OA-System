<?php
require_once __DIR__ . '/BaseRepository.php';

class RoleRepository extends BaseRepository {
    protected string $table = 'roles';

    /** 系统支持的全部权限项。新增权限时在此登记。 */
    public const ALL_PERMISSIONS = [
        'view_dashboard', 'view_accounts', 'verify_accounts', 'view_transactions',
        'view_assets', 'manage_assets', 'manage_my_applications', 'manage_pending_approvals',
        'manage_pending_accounting', 'manage_pending_execution',
        'manage_configurations', 'manage_personnel',
    ];

    public function findAllRoles(): array {
        $stmt = $this->db->query(
            "SELECT r.*,
                    COALESCE(array_agg(p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL), '{}') AS perms,
                    (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
             FROM roles r
             LEFT JOIN role_permissions p ON p.role_id = r.id
             GROUP BY r.id ORDER BY r.is_system DESC, r.id"
        );
        return array_map([$this, 'shape'], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    public function findByIdWithPerms(int $id): ?array {
        $stmt = $this->db->prepare(
            "SELECT r.*,
                    COALESCE(array_agg(p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL), '{}') AS perms,
                    (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
             FROM roles r
             LEFT JOIN role_permissions p ON p.role_id = r.id
             WHERE r.id = ? GROUP BY r.id"
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? $this->shape($row) : null;
    }

    /** 按角色 code 取权限，供鉴权使用 */
    public function permissionsOfCode(string $code): array {
        $stmt = $this->db->prepare(
            "SELECT p.permission_key FROM roles r
             JOIN role_permissions p ON p.role_id = r.id
             WHERE r.code = ?"
        );
        $stmt->execute([$code]);
        return array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'permission_key');
    }

    /** PG 数组文本 → PHP 数组 */
    private function shape(array $r): array {
        $raw = $r['perms'] ?? '{}';
        $perms = is_array($raw) ? $raw : array_filter(explode(',', trim((string)$raw, '{}')));
        return [
            'id'          => (string)$r['id'],
            'code'        => $r['code'],
            'name'        => $r['name'],
            'description' => $r['description'] ?? '',
            'isSystem'    => (bool)$r['is_system'],
            'userCount'   => (int)$r['user_count'],
            'permissions' => array_values(array_map(fn($x) => trim($x, '"'), $perms)),
        ];
    }

    public function insert(string $code, string $name, ?string $desc): array {
        $stmt = $this->db->prepare(
            "INSERT INTO roles (code, name, description, is_system) VALUES (?,?,?,FALSE) RETURNING *"
        );
        $stmt->execute([$code, $name, $desc]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateBasic(int $id, string $name, ?string $desc): bool {
        $stmt = $this->db->prepare(
            "UPDATE roles SET name = ?, description = ?, updated_at = NOW() WHERE id = ?"
        );
        $stmt->execute([$name, $desc, $id]);
        return $stmt->rowCount() > 0;
    }

    public function replacePermissions(int $roleId, array $keys): void {
        $this->db->prepare("DELETE FROM role_permissions WHERE role_id = ?")->execute([$roleId]);
        if (!$keys) return;
        $ins = $this->db->prepare(
            "INSERT INTO role_permissions (role_id, permission_key) VALUES (?,?) ON CONFLICT DO NOTHING"
        );
        foreach ($keys as $k) $ins->execute([$roleId, $k]);
    }

    public function deleteRole(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM roles WHERE id = ? AND is_system = FALSE");
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    public function countUsers(int $roleId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM users WHERE role_id = ?");
        $stmt->execute([$roleId]);
        return (int)$stmt->fetchColumn();
    }

    public function findByCode(string $code): ?array {
        $stmt = $this->db->prepare("SELECT * FROM roles WHERE code = ?");
        $stmt->execute([$code]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }
}
