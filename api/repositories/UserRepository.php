<?php
require_once __DIR__ . '/BaseRepository.php';

class UserRepository extends BaseRepository {
    protected string $table = 'users';

    /**
     * 安全查询（不含密码），用于 API 返回
     */
    public function findByIdSafe(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active,
                   u.created_at, u.updated_at, u.department_id, u.notes, d.name AS department_name
            FROM users u
            LEFT JOIN departments d ON d.id = u.department_id
            WHERE u.id = ?
        ");
        $stmt->execute([$id]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function findByUsername(string $username): ?array {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ?: null;
    }

    public function findByProjectId(int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active, u.created_at,
                   up.role as project_role,
                   u.department_id, u.notes, d.name AS department_name
            FROM users u
            JOIN user_projects up ON u.id = up.user_id
            LEFT JOIN departments d ON d.id = u.department_id
            WHERE up.project_id = ?
            ORDER BY u.id
        ");
        $stmt->execute([$projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * 修改密码（需验证旧密码）
     */
    public function changePassword(int $userId, string $oldPassword, string $newPassword): bool {
        $user = $this->findById($userId);
        if (!$user) {
            throw new \RuntimeException('用户不存在');
        }
        if (!password_verify($oldPassword, $user['password'])) {
            throw new \RuntimeException('原密码错误');
        }
        $hash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare("UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?");
        return $stmt->execute([$hash, $userId]);
    }

    /**
     * 创建用户并加入指定项目。
     * 密码在此统一 bcrypt 哈希，调用方不得传入明文以外的内容。
     */
    public function createWithProject(array $d, int $projectId): array {
        $exists = $this->db->prepare("SELECT 1 FROM users WHERE username = ?");
        $exists->execute([$d['username']]);
        if ($exists->fetch()) {
            throw new \InvalidArgumentException('用户名已存在');
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                "INSERT INTO users (username, password, full_name, email, role, is_active, department_id, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, username, full_name, email, role, is_active, department_id, notes, created_at, updated_at"
            );
            $stmt->execute([
                $d['username'],
                password_hash($d['password'], PASSWORD_BCRYPT),
                $d['full_name'] ?? '',
                // 不能写成 $d['email'] ?? ''：email 有唯一约束，
                // 空串会让第二个未填邮箱的用户撞 users_email_key，必须保持 NULL
                ($d['email'] ?? null) !== '' ? ($d['email'] ?? null) : null,
                $d['role'] ?? 'user',
                $d['is_active'] ?? true,
                !empty($d['department_id']) ? (int)$d['department_id'] : null,
                ($d['notes'] ?? '') !== '' ? $d['notes'] : null,
            ]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            $this->db->prepare(
                "INSERT INTO user_projects (user_id, project_id, role) VALUES (?, ?, ?)
                 ON CONFLICT (user_id, project_id) DO NOTHING"
            )->execute([(int)$user['id'], $projectId, $d['role'] === 'admin' ? 'admin' : 'member']);

            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $user;
    }

    /**
     * 重置密码（管理员操作，不校验旧密码）。
     * 与 changePassword 的区别：后者是本人修改、必须验证旧密码。
     */
    public function resetPassword(int $userId, string $newPassword): void {
        $stmt = $this->db->prepare("UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?");
        $stmt->execute([password_hash($newPassword, PASSWORD_BCRYPT), $userId]);
    }

    /** 某部门的成员；部门页展开时用，此前服务端没有这个查询 */
    public function findByDepartment(int $departmentId, int $projectId): array {
        $stmt = $this->db->prepare("
            SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active
            FROM users u
            JOIN user_projects up ON up.user_id = u.id AND up.project_id = ?
            WHERE u.department_id = ?
            ORDER BY u.id
        ");
        $stmt->execute([$projectId, $departmentId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** 用户偏好的展示本位币；未设置时按 USD */
    public function getBaseCurrency(int $userId): string {
        $stmt = $this->db->prepare("SELECT base_currency FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        return (string)($stmt->fetchColumn() ?: 'USD');
    }

    public function setBaseCurrency(int $userId, string $code): void {
        $stmt = $this->db->prepare("UPDATE users SET base_currency = ?, updated_at = NOW() WHERE id = ?");
        $stmt->execute([$code, $userId]);
    }

    /** 用户是否隶属于指定项目 */
    public function belongsToProject(int $userId, int $projectId): bool {
        $stmt = $this->db->prepare("SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?");
        $stmt->execute([$userId, $projectId]);
        return (bool) $stmt->fetch();
    }

    public function isSuperAdmin(int $userId): bool {
        $stmt = $this->db->prepare("SELECT id FROM super_admins WHERE user_id = ?");
        $stmt->execute([$userId]);
        return (bool) $stmt->fetch();
    }

    public function getUserProjects(int $userId, bool $isSuperAdmin = false): array {
        if ($isSuperAdmin) {
            $stmt = $this->db->prepare("SELECT * FROM projects WHERE active = true ORDER BY id");
            $stmt->execute();
        } else {
            $stmt = $this->db->prepare("
                SELECT p.* FROM projects p
                JOIN user_projects up ON p.id = up.project_id
                WHERE up.user_id = ? AND p.active = true
                ORDER BY p.id
            ");
            $stmt->execute([$userId]);
        }
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
