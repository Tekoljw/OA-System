<?php
/**
 * 应用程序全局配置
 */

// 错误报告配置
error_reporting(E_ALL);
ini_set('display_errors', 1);

// 设置时区
date_default_timezone_set('Asia/Shanghai');

// 定义常量
define('API_ROOT', realpath(dirname(__FILE__) . '/..'));
define('BASE_URL', getenv('BASE_URL') ?: '');

// 引入CORS助手
require_once API_ROOT . '/utils/cors_helper.php';

// 应用CORS设置
CorsHelper::handleRequest();

// 用于响应的工具函数
function sendResponse($status, $message, $data = null) {
    http_response_code($status);
    
    $response = [
        'success' => $status >= 200 && $status < 300,
        'message' => $message
    ];
    
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    echo json_encode($response);
    exit;
}

// 载入数据库配置
require_once API_ROOT . '/config/database.php';

// 自动加载模型
$model_files = glob(API_ROOT . '/models/*.php');
foreach ($model_files as $file) {
    require_once $file;
}

// 自动加载工具类
$util_files = glob(API_ROOT . '/utils/*.php');
foreach ($util_files as $file) {
    require_once $file;
}