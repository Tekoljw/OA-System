<?php
/**
 * 登录测试API
 * 简化的登录处理，用于验证前端和后端连接是否正常
 */

// 允许跨域请求
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

// 处理OPTIONS预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 只接受POST请求
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => '只接受POST请求']);
    exit;
}

// 获取并解析请求数据
$requestData = json_decode(file_get_contents("php://input"), true);

// 记录接收到的数据，便于调试
$logFile = __DIR__ . '/login_debug.log';
file_put_contents($logFile, date('Y-m-d H:i:s') . " - 接收到请求: " . print_r($requestData, true) . "\n", FILE_APPEND);

// 硬编码的测试用户认证
if (isset($requestData['username']) && isset($requestData['password'])) {
    $username = $requestData['username'];
    $password = $requestData['password'];
    
    // 记录登录尝试
    file_put_contents($logFile, date('Y-m-d H:i:s') . " - 登录尝试: $username / $password\n", FILE_APPEND);
    
    // 简单的验证方式 - 仅用于测试
    if ($username === 'phpuser' && $password === '123456') {
        // 成功登录
        $response = [
            'success' => true,
            'message' => '登录成功',
            'data' => [
                'id' => 1,
                'username' => 'phpuser',
                'fullName' => 'PHP测试用户',
                'role' => 'admin',
                'isSuperAdmin' => true,
                'token' => 'test-token-' . time(),
                'projectsList' => [
                    [
                        'id' => 1,
                        'name' => '演示项目',
                        'code' => 'default',
                        'description' => '系统演示项目',
                        'active' => true
                    ]
                ],
                'currentProject' => [
                    'id' => 1,
                    'name' => '演示项目', 
                    'code' => 'default',
                    'description' => '系统演示项目',
                    'active' => true
                ],
                'projectId' => 1
            ]
        ];
        
        // 记录成功登录
        file_put_contents($logFile, date('Y-m-d H:i:s') . " - 登录成功: $username\n", FILE_APPEND);
    } else {
        // 登录失败
        $response = [
            'success' => false,
            'message' => '用户名或密码错误'
        ];
        
        // 记录登录失败
        file_put_contents($logFile, date('Y-m-d H:i:s') . " - 登录失败: $username\n", FILE_APPEND);
    }
    
    // 返回JSON响应
    echo json_encode($response);
} else {
    // 缺少必要参数
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '缺少必要参数']);
    
    // 记录错误请求
    file_put_contents($logFile, date('Y-m-d H:i:s') . " - 错误请求: 缺少必要参数\n", FILE_APPEND);
}