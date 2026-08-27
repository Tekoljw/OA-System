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

        return $payload;
    }
}
