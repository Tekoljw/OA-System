<?php
/**
 * CORS跨域支持工具类
 * 提供跨域资源共享支持，替代原有的Node.js代理服务器
 */

class CorsHelper {
    /**
     * 设置CORS头
     * 
     * @param string $allowOrigin 允许的来源域名，默认为*
     * @return void
     */
    private static array $allowedOrigins = [
        'https://oa.starway.sg',
        'https://www.starway.sg',
    ];

    public static function setCorsHeaders($allowOrigin = null) {
        // 使用白名单校验
        if ($allowOrigin === null || $allowOrigin === '*') {
            $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
            $allowOrigin = in_array($origin, self::$allowedOrigins, true) ? $origin : '';
        }
        if ($allowOrigin) {
            header("Access-Control-Allow-Origin: $allowOrigin");
        }
        
        // 允许的HTTP方法
        header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
        
        // 允许的头信息
        header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
        
        // 允许凭证
        header("Access-Control-Allow-Credentials: true");
        
        // 预检请求缓存时间
        header("Access-Control-Max-Age: 86400");
        
        // 如果是OPTIONS预检请求，直接返回200
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }
    
    /**
     * 处理请求
     * 
     * @param string $allowOrigin 允许的来源域名，默认为*
     * @return void
     */
    public static function handleRequest($allowOrigin = null) {
        // 设置CORS头信息
        self::setCorsHeaders($allowOrigin);
        
        // 设置JSON内容类型
        header('Content-Type: application/json; charset=UTF-8');
    }
}