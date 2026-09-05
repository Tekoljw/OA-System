<?php
require_once __DIR__ . '/../repositories/RoleRepository.php';
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
        // 前后空格一律忽略：既避免用户复制粘贴时莫名登不上，
        // 也堵掉靠加空格把失败次数分散到多个计数键的绕过方式
        $username = trim($username);

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
            'permissions' => $this->permissionsFor($user, $isSuperAdmin),
            'projectsList' => $projects,
            'currentProject' => $currentProject,
            'projectId' => $currentProject ? $currentProject['id'] : null,
            'hasMultipleProjects' => count($projects) > 1
        ];
    }


    /**
     * 当前用户的权限清单，供前端控制菜单与操作入口的可见性。
     * 超级管理员拥有全部权限。
     * 注意：这只是「显示层」的依据，服务端仍会独立校验，
     * 前端拿到什么并不影响后端是否放行。
     */
    private function permissionsFor(array $user, bool $isSuperAdmin): array {
        if ($isSuperAdmin) {
            return RoleRepository::ALL_PERMISSIONS;
        }
        $perms = (new RoleRepository($this->db))->permissionsOfCode((string)($user['role'] ?? ''));

        // 部门主管的审批职责是写死的对应关系，与角色无关：
        // 哪个部门的员工提交，就由哪个部门的主管审批。
        // 若不在这里补上，普通角色的主管连待审批页都进不去，整条审批链卡死。
        if ($this->isAnyDepartmentManager((int)$user['id'])
            && !in_array('manage_pending_approvals', $perms, true)) {
            $perms[] = 'manage_pending_approvals';
        }
        return $perms;
    }

    private function isAnyDepartmentManager(int $userId): bool {
        $stmt = $this->db->prepare("SELECT 1 FROM departments WHERE manager_id = ? LIMIT 1");
        $stmt->execute([$userId]);
        return (bool)$stmt->fetchColumn();
    }

    public function getUserInfo(int $userId): array {
        $user = $this->userRepo->findByIdSafe($userId);
        if (!$user) {
            throw new \RuntimeException('用户不存在');
        }

        $isSuperAdmin = $this->userRepo->isSuperAdmin($userId);
        $projects = $this->userRepo->getUserProjects($userId, $isSuperAdmin);

        // 当前项目取用户上次选择的那个；没有记录、或该项目已不可访问（被删除、
        // 权限被收回）时才回落到第一个。此前这里硬编码 $projects[0]，
        // 导致界面上切换项目后一刷新就被打回第一个项目。
        $current = null;
        if (!empty($user['last_project_id'])) {
            foreach ($projects as $p) {
                if ((int)$p['id'] === (int)$user['last_project_id']) { $current = $p; break; }
            }
        }
        if ($current === null) {
            $current = !empty($projects) ? $projects[0] : null;
        }

        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'fullName' => $user['full_name'],
            'role' => $user['role'],
            'email' => $user['email'],
            'isSuperAdmin' => $isSuperAdmin,
            'is_super_admin' => $isSuperAdmin,
            'permissions' => $this->permissionsFor($user, $isSuperAdmin),
            'projectsList' => $projects,
            'currentProject' => $current,
            'projectId' => $current !== null ? $current['id'] : null,
            'hasMultipleProjects' => count($projects) > 1
        ];
    }

    public function switchProject(int $userId, int $projectId): array {
        $isSuperAdmin = $this->userRepo->isSuperAdmin($userId);
        $projects = $this->userRepo->getUserProjects($userId, $isSuperAdmin);

        foreach ($projects as $project) {
            if ($project['id'] == $projectId) {
                // 落库，否则刷新页面后 getUserInfo() 会把选择覆盖回第一个项目
                $this->userRepo->setLastProject($userId, $projectId);
                return $project;
            }
        }

        throw new \RuntimeException('无权访问该项目');
    }

    // ===== 登录限流 =====
    private const MAX_ATTEMPTS_PER_IP = 5;       // 单IP+用户名 最多失败次数
    private const MAX_ATTEMPTS_PER_USER = 20;    // 纯用户名 最多失败次数（防IP伪造绕过）
    private const LOCKOUT_MINUTES = 15;          // 锁定时长（分钟）

    /**
     * 计数键做了小写归一，但没去空格 —— 「 admin」会被当成另一个账号单独计数，
     * 攻击者靠加前后空格就能把失败次数分散到多个键上，锁定形同虚设。
     */
    private static function normalizeUsername(string $username): string {
        return strtolower(trim($username));
    }

    private function getLoginKey(string $username): string {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        return md5($ip . ':' . self::normalizeUsername($username));
    }

    private function getUserLoginKey(string $username): string {
        return md5('user:' . self::normalizeUsername($username));
    }

    private function checkLoginAttempts(string $username): void {
        // 检查 IP+用户名 维度
        $this->checkAttemptKey($this->getLoginKey($username), self::MAX_ATTEMPTS_PER_IP);
        // 检查纯用户名维度（防止换 IP 暴力破解）
        $this->checkAttemptKey($this->getUserLoginKey($username), self::MAX_ATTEMPTS_PER_USER);
    }

    private function checkAttemptKey(string $key, int $maxAttempts): void {
        $stmt = $this->db->prepare(
            "SELECT attempts, last_attempt FROM login_attempts WHERE attempt_key = ?"
        );
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return;

        if ((int)$row['attempts'] >= $maxAttempts) {
            $lockUntil = strtotime($row['last_attempt']) + (self::LOCKOUT_MINUTES * 60);
            if (time() < $lockUntil) {
                $remaining = (int)ceil(($lockUntil - time()) / 60);
                throw new \RuntimeException("登录失败次数过多，请 {$remaining} 分钟后再试");
            }
            // 锁定期已过，清除记录
            $delStmt = $this->db->prepare("DELETE FROM login_attempts WHERE attempt_key = ?");
            $delStmt->execute([$key]);
        }
    }

    private function recordFailedLogin(string $username): void {
        // 同时记录两个维度
        $keys = [$this->getLoginKey($username), $this->getUserLoginKey($username)];
        $stmt = $this->db->prepare(
            "INSERT INTO login_attempts (attempt_key, attempts, last_attempt)
             VALUES (?, 1, NOW())
             ON CONFLICT (attempt_key) DO UPDATE SET attempts = login_attempts.attempts + 1, last_attempt = NOW()"
        );
        foreach ($keys as $key) {
            $stmt->execute([$key]);
        }
    }

    private function clearLoginAttempts(string $username): void {
        $keys = [$this->getLoginKey($username), $this->getUserLoginKey($username)];
        $stmt = $this->db->prepare("DELETE FROM login_attempts WHERE attempt_key = ?");
        foreach ($keys as $key) {
            $stmt->execute([$key]);
        }
    }
}
