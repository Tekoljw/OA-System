<?php
/**
 * JSON 请求/响应中间件
 */
class JsonMiddleware {
    public static function handle(): void {
        header('Content-Type: application/json; charset=utf-8');
    }

    /**
     * 解析 JSON 请求体
     */
    private const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

    public static function getRequestBody(): array {
        $raw = file_get_contents('php://input');
        if (empty($raw)) return [];
        if (strlen($raw) > self::MAX_BODY_SIZE) {
            require_once __DIR__ . '/../utils/Response.php';
            Response::error('请求体过大，最大允许 2MB', 'PAYLOAD_TOO_LARGE', 413);
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
