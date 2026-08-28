<?php
require_once __DIR__ . '/BaseRepository.php';

class UserRepository extends BaseRepository {
    protected string $table = 'users';

    /**
     * 安全查询（不含密码），用于 API 返回
     */
    public function findByIdSafe(int $id): ?array {
        $stmt = $this->db->prepare("SELECT id, username, full_name, email, role, is_active, created_at, updated_at FROM users WHERE id = ?");
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
                   up.role as project_role
            FROM users u
            JOIN user_projects up ON u.id = up.user_id
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
