<?php
require_once __DIR__ . '/../repositories/RoleRepository.php';

/**
 * 角色与权限
 *
 * 权限判断的唯一入口是 can()。此前系统各处直接比较 role === 'admin'，
 * 角色一旦可自定义，那种写法就无法表达「这个角色能不能做这件事」。
 */
class RoleService {
    private PDO $db;
    private RoleRepository $repo;

    /** 角色 code 的权限缓存，避免同一请求内重复查库 */
    private static array $permCache = [];

    public function __construct(PDO $db) {
        $this->db   = $db;
        $this->repo = new RoleRepository($db);
    }

    // ==================== 鉴权 ====================

    /**
     * 当前用户是否具备某项权限。
     * 超级管理员始终放行；其余按其角色配置的权限判断。
     */
    public function can(?array $user, string $permission): bool {
        if (!$user) return false;
        if (!empty($user['isSuperAdmin']) || !empty($user['is_super_admin'])) return true;

        $code = (string)($user['role'] ?? '');
        if ($code === '') return false;

        if (!array_key_exists($code, self::$permCache)) {
            self::$permCache[$code] = $this->repo->permissionsOfCode($code);
        }
        return in_array($permission, self::$permCache[$code], true);
    }

    // ==================== 配置 ====================

    public function listRoles(): array {
        return $this->repo->findAllRoles();
    }

    public function allPermissions(): array {
        return RoleRepository::ALL_PERMISSIONS;
    }

    private function validate(array $d, bool $isCreate): array {
        $name = trim((string)($d['name'] ?? ''));
        if ($name === '') throw new \InvalidArgumentException('角色名称不能为空');

        $perms = $d['permissions'] ?? [];
        if (!is_array($perms)) throw new \InvalidArgumentException('权限格式无效');
        foreach ($perms as $p) {
            if (!in_array($p, RoleRepository::ALL_PERMISSIONS, true)) {
                throw new \InvalidArgumentException('未知的权限项: ' . $p);
            }
        }
        return [$name, array_values(array_unique($perms))];
    }

    public function createRole(array $d): array {
        [$name, $perms] = $this->validate($d, true);

        // code 用于与 users.role 对应；未指定时按名称生成一个安全的标识
        $code = trim((string)($d['code'] ?? ''));
        if ($code === '') {
            $code = 'role_' . substr(md5($name . microtime(true)), 0, 10);
        }
        if (!preg_match('/^[a-z0-9_]{2,50}$/', $code)) {
            throw new \InvalidArgumentException('角色标识只能包含小写字母、数字和下划线');
        }
        if ($this->repo->findByCode($code)) {
            throw new \InvalidArgumentException('角色标识已存在');
        }

        $this->db->beginTransaction();
        try {
            $role = $this->repo->insert($code, $name, $d['description'] ?? null);
            $this->repo->replacePermissions((int)$role['id'], $perms);
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->repo->findByIdWithPerms((int)$role['id']);
    }

    public function updateRole(int $id, array $d): array {
        $role = $this->repo->findByIdWithPerms($id);
        if (!$role) throw new \RuntimeException('角色不存在');

        [$name, $perms] = $this->validate($d, false);

        // 内置角色允许改名称与描述，但权限不可削减——
        // 否则一旦误删 manage_personnel，就再也没人能进权限页改回来。
        if ($role['isSystem'] && $role['code'] === 'admin') {
            $perms = RoleRepository::ALL_PERMISSIONS;
        }

        $this->db->beginTransaction();
        try {
            $this->repo->updateBasic($id, $name, $d['description'] ?? null);
            $this->repo->replacePermissions($id, $perms);
            $this->db->commit();
        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
        return $this->repo->findByIdWithPerms($id);
    }

    public function deleteRole(int $id): void {
        $role = $this->repo->findByIdWithPerms($id);
        if (!$role) throw new \RuntimeException('角色不存在');
        if ($role['isSystem']) {
            throw new \InvalidArgumentException('系统内置角色不可删除');
        }
        $n = $this->repo->countUsers($id);
        if ($n > 0) {
            throw new \InvalidArgumentException(sprintf('该角色下还有 %d 个用户，无法删除', $n));
        }
        if (!$this->repo->deleteRole($id)) {
            throw new \RuntimeException('删除失败');
        }
    }
}
