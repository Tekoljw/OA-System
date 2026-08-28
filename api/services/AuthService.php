<?php
require_once __DIR__ . '/../repositories/UserRepository.php';
require_once __DIR__ . '/../utils/auth.php';

class AuthService {
    private UserRepository $userRepo;
    private PDO $db;

    public function __construct(PDO $db) {
        $this->db = $db;
        $this->userRepo = new UserRepository($db);
    }

    public function login(string $username, string $password, ?int $projectId = null): array {
        // 暴力破解防护：检查登录失败次数（基于IP + 用户名）
        $this->checkLoginAttempts($username);

        $user = $this->userRepo->findByUsername($username);
        if (!$user || !password_verify($password, $user['password'])) {
            $this->recordFailedLogin($username);
            throw new \RuntimeException('用户名或密码错误');
        }
        // 登录成功，清除失败记录
        $this->clearLoginAttempts($username);

        if (!$user['is_active']) {
            throw new \RuntimeException('账户已被禁用');
        }

        $isSuperAdmin = $this->userRepo->isSuperAdmin($user['id']);
        $projects = $this->userRepo->getUserProjects($user['id'], $isSuperAdmin);

        $currentProject = null;
        if ($projectId && !empty($projects)) {
            foreach ($projects as $p) {
                if ($p['id'] == $projectId) {
                    $currentProject = $p;
                    break;
                }
            }
        }
        if (!$currentProject && !empty($projects)) {
            $currentProject = $projects[0];
        }

        $token = generateToken([
            'id' => $user['id'],
            'username' => $user['username'],
            'role' => $user['role']
        ]);

        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'fullName' => $user['full_name'],
            'role' => $user['role'],
            'email' => $user['email'],
            'isSuperAdmin' => $isSuperAdmin,
            'is_super_admin' => $isSuperAdmin,
            'token' => $token,
            'projectsList' => $projects,
            'currentProject' => $currentProject,
            'projectId' => $currentProject ? $currentProject['id'] : null,
            'hasMultipleProjects' => count($projects) > 1
        ];
    }

    public function getUserInfo(int $userId): array {
        $user = $this->userRepo->findById($userId);
        if (!$user) {
            throw new \RuntimeException('用户不存在');
        }

        $isSuperAdmin = $this->userRepo->isSuperAdmin($userId);
        $projects = $this->userRepo->getUserProjects($userId, $isSuperAdmin);

        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'fullName' => $user['full_name'],
            'role' => $user['role'],
            'email' => $user['email'],
            'isSuperAdmin' => $isSuperAdmin,
            'is_super_admin' => $isSuperAdmin,
            'projectsList' => $projects,
            'currentProject' => !empty($projects) ? $projects[0] : null,
            'projectId' => !empty($projects) ? $projects[0]['id'] : null,
            'hasMultipleProjects' => count($projects) > 1
        ];
    }

    public function switchProject(int $userId, int $projectId): array {
        $isSuperAdmin = $this->userRepo->isSuperAdmin($userId);
        $projects = $this->userRepo->getUserProjects($userId, $isSuperAdmin);

        foreach ($projects as $project) {
            if ($project['id'] == $projectId) {
                return $project;
            }
        }

        throw new \RuntimeException('无权访问该项目');
    }

    // ===== 登录限流 =====
    private const MAX_ATTEMPTS = 5;         // 最多失败次数
    private const LOCKOUT_MINUTES = 15;     // 锁定时长（分钟）

    private function getLoginKey(string $username): string {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        return md5($ip . ':' . strtolower($username));
    }

    private function checkLoginAttempts(string $username): void {
        $key = $this->getLoginKey($username);
        $stmt = $this->db->prepare(
            "SELECT attempts, last_attempt FROM login_attempts WHERE attempt_key = ?"
        );
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return;

        if ((int)$row['attempts'] >= self::MAX_ATTEMPTS) {
            $lockUntil = strtotime($row['last_attempt']) + (self::LOCKOUT_MINUTES * 60);
            if (time() < $lockUntil) {
                $remaining = (int)ceil(($lockUntil - time()) / 60);
                throw new \RuntimeException("登录失败次数过多，请 {$remaining} 分钟后再试");
            }
            // 锁定期已过，清除记录
            $this->clearLoginAttempts($username);
        }
    }

    private function recordFailedLogin(string $username): void {
        $key = $this->getLoginKey($username);
        $stmt = $this->db->prepare(
            "INSERT INTO login_attempts (attempt_key, attempts, last_attempt)
             VALUES (?, 1, NOW())
             ON CONFLICT (attempt_key) DO UPDATE SET attempts = login_attempts.attempts + 1, last_attempt = NOW()"
        );
        $stmt->execute([$key]);
    }

    private function clearLoginAttempts(string $username): void {
        $key = $this->getLoginKey($username);
        $stmt = $this->db->prepare("DELETE FROM login_attempts WHERE attempt_key = ?");
        $stmt->execute([$key]);
    }
}
