<?php
/**
 * JWT 认证中间件
 */
class AuthMiddleware {
    /**
     * 验证 JWT token，返回当前用户信息
     * @return array|null 用户信息或 null（公开路由）
     */
    public static function handle(bool $required = true): ?array {
        require_once __DIR__ . '/../utils/auth.php';

        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        if (empty($authHeader) || !str_starts_with($authHeader, 'Bearer ')) {
            if ($required) {
                require_once __DIR__ . '/../utils/Response.php';
                Response::error('未提供认证令牌', 'UNAUTHORIZED', 401);
            }
            return null;
        }

        $token = substr($authHeader, 7);
        $payload = validateToken($token);

        if (!$payload) {
            if ($required) {
                require_once __DIR__ . '/../utils/Response.php';
                Response::error('认证令牌无效或已过期', 'UNAUTHORIZED', 401);
            }
            return null;
        }

        // 映射 JWT 标准字段到业务字段
        if (isset($payload['sub'])) {
            $payload['id'] = $payload['sub'];
        }

        // 角色与启用状态一律以库为准，不信 token 里的副本。
        //
        // token 有效期 24 小时，若照搬 payload 里的 role：
        // 管理员把某人降级或停用之后，对方手上的旧 token 仍带着原来的角色，
        // 最长一整天里照样能做管理员才能做的事 —— 撤权等于没撤。
        $current = self::loadCurrentUser((int)$payload['id']);
        if (!$current) {
            if ($required) {
                require_once __DIR__ . '/../utils/Response.php';
                Response::error('账号不存在或已被删除，请重新登录', 'UNAUTHORIZED', 401);
            }
            return null;
        }
        // PDO 取回来的 boolean 是字符串 'f'/'t'，直接判真会把停用账号放行
        $isActive = filter_var($current['is_active'], FILTER_VALIDATE_BOOLEAN);
        if (!$isActive) {
            if ($required) {
                require_once __DIR__ . '/../utils/Response.php';
                Response::error('账号已被停用，请联系管理员', 'FORBIDDEN', 403);
            }
            return null;
        }

        $payload['role']     = $current['role'];
        $payload['name']     = $current['username'];
        $payload['fullName'] = $current['full_name'];

        return $payload;
    }

    /** 读取用户当前的角色与启用状态 */
    private static function loadCurrentUser(int $userId): ?array {
        require_once __DIR__ . '/../config/database.php';
        static $cache = [];
        if (array_key_exists($userId, $cache)) return $cache[$userId];

        $db = (new Database())->getConnection();
        if (!$db) return null;
        $stmt = $db->prepare("SELECT id, username, full_name, role, is_active FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        return $cache[$userId] = $row;
    }
}
