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
    public static function getRequestBody(): array {
        $raw = file_get_contents('php://input');
        if (empty($raw)) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
