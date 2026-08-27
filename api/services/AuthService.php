<?php
require_once __DIR__ . '/../repositories/UserRepository.php';
require_once __DIR__ . '/../utils/auth.php';

class AuthService {
    private UserRepository $userRepo;

    public function __construct(PDO $db) {
        $this->userRepo = new UserRepository($db);
    }

    public function login(string $username, string $password, ?int $projectId = null): array {
        $user = $this->userRepo->findByUsername($username);
        if (!$user || !password_verify($password, $user['password'])) {
            throw new \RuntimeException('用户名或密码错误');
        }

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
}
