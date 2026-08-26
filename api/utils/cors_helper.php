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
    public static function setCorsHeaders($allowOrigin = '*') {
        // 允许的源
        header("Access-Control-Allow-Origin: $allowOrigin");
        
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
    public static function handleRequest($allowOrigin = '*') {
        // 设置CORS头信息
        self::setCorsHeaders($allowOrigin);
        
        // 设置JSON内容类型
        header('Content-Type: application/json; charset=UTF-8');
    }
}