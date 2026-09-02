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
        // 解析失败要当场说清楚。此前一律返回空数组，
        // 报出来的是「标题不能为空」这类风马牛不相及的错，排查方向全歪
        if (json_last_error() !== JSON_ERROR_NONE) {
            require_once __DIR__ . '/../utils/Response.php';
            Response::error('请求内容不是合法的 JSON：' . json_last_error_msg(), 'INVALID_JSON', 400);
        }
        return is_array($data) ? $data : [];
    }
}
