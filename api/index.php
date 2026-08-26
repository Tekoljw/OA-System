<?php
/**
 * API入口文件
 * 负责分发请求到对应的控制器
 */

// 添加CORS头
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 3600');

// 处理OPTIONS预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'config/config.php';

// 获取请求路径
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$path_parts = explode('/', trim($path, '/'));

// 添加调试日志
error_log("API请求: 路径=$path, 部分=" . implode(',', $path_parts));

// 处理两种情况: 
// 1. /api/endpoint 标准路径
// 2. /api 不带端点的请求 (直接返回API状态)
if (count($path_parts) < 1 || (count($path_parts) == 1 && $path_parts[0] !== 'api') || (count($path_parts) > 1 && $path_parts[0] !== 'api')) {
    sendResponse(404, '请求的API端点不存在');
}

// 提取API路径部分 - 如果只有/api则返回默认状态信息
if (count($path_parts) == 1 && $path_parts[0] === 'api') {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true, 
        'message' => 'PHP API服务正在运行',
        'version' => '1.0.0',
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    exit;
}

// 正常API请求处理
$endpoint = $path_parts[1];

// 处理测试路径
if ($endpoint === 'test') {
    // 直接包含测试登录文件 - 支持多种路径格式
    if ((isset($path_parts[2]) && $path_parts[2] === 'login.php') || 
        (isset($path_parts[2]) && $path_parts[2] === 'login')) {
        require_once __DIR__ . '/test/login.php';
        exit;
    }
}

// 根据端点分发请求到不同的控制器
switch ($endpoint) {
    // 身份验证相关接口
    case 'login':
    case 'logout':
    case 'register':
    case 'user':
    case 'switch-project':
        require_once 'controllers/auth_controller.php';
        break;
    
    // 项目相关接口
    case 'projects':
        require_once 'controllers/projects_controller.php';
        break;
    
    // 账户相关接口
    case 'accounts':
    case 'account-types':
    case 'account-summary':
        require_once 'controllers/accounts_controller.php';
        break;
    
    // 交易相关接口
    case 'transactions':
    case 'transaction-summary':
        require_once 'controllers/transactions_controller.php';
        break;
    
    // 配置相关接口
    case 'currency-types':
    case 'asset-types':
    case 'subjects':
        require_once 'controllers/config_controller.php';
        break;
    
    // 仪表盘相关接口
    case 'dashboard-data':
    case 'income-by-subject':
    case 'expense-by-subject':
    case 'expense-by-department':
    case 'recent-transactions':
    case 'project-stats':
        require_once 'controllers/dashboard_controller.php';
        break;
    
    // API文档
    case 'docs':
        header('Content-Type: text/html; charset=UTF-8');
        echo '
        <!DOCTYPE html>
        <html>
        <head>
            <title>OA财务系统 API文档</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
                h1 { color: #333; }
                h2 { color: #0066cc; margin-top: 30px; }
                h3 { color: #009900; }
                pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
                .endpoint { background: #e6f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; margin-right: 10px; }
                .get { background-color: #61affe; }
                .post { background-color: #49cc90; }
                .put { background-color: #fca130; }
                .delete { background-color: #f93e3e; }
            </style>
        </head>
        <body>
            <h1>OA财务系统 API文档</h1>
            
            <p>本文档提供OA财务系统API的使用说明。所有请求都需要进行身份验证（除了登录和注册接口）。</p>
            
            <h2>身份验证接口</h2>
            
            <div class="endpoint">
                <h3><span class="method post">POST</span> /api/login</h3>
                <p>用户登录接口</p>
                <p><strong>请求参数：</strong></p>
                <pre>
{
  "username": "用户名",
  "password": "密码",
  "projectId": 1 // 可选，指定登录后使用的项目ID
}
                </pre>
                <p><strong>响应：</strong></p>
                <pre>
{
  "success": true,
  "message": "登录成功",
  "data": {
    "id": 1,
    "username": "admin",
    "fullName": "系统管理员",
    "role": "admin",
    "isSuperAdmin": true,
    "token": "JWT令牌...",
    "projectsList": [
      {
        "id": 1,
        "name": "演示项目",
        "code": "default"
      }
    ],
    "currentProject": {
      "id": 1,
      "name": "演示项目",
      "code": "default"
    },
    "projectId": 1
  }
}
                </pre>
            </div>
            
            <div class="endpoint">
                <h3><span class="method post">POST</span> /api/logout</h3>
                <p>用户注销接口</p>
                <p><strong>响应：</strong></p>
                <pre>
{
  "success": true,
  "message": "已成功注销"
}
                </pre>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/user</h3>
                <p>获取当前用户信息</p>
                <p><strong>响应：</strong></p>
                <pre>
{
  "success": true,
  "message": "获取用户信息成功",
  "data": {
    "id": 1,
    "username": "admin",
    "fullName": "系统管理员",
    "role": "admin",
    "isSuperAdmin": true,
    "projectsList": [
      {
        "id": 1,
        "name": "演示项目",
        "code": "default"
      }
    ],
    "currentProject": {
      "id": 1,
      "name": "演示项目",
      "code": "default"
    },
    "projectId": 1
  }
}
                </pre>
            </div>
            
            <div class="endpoint">
                <h3><span class="method post">POST</span> /api/switch-project</h3>
                <p>切换当前项目</p>
                <p><strong>请求参数：</strong></p>
                <pre>
{
  "projectId": 2
}
                </pre>
                <p><strong>响应：</strong></p>
                <pre>
{
  "success": true,
  "message": "已切换到项目: 测试",
  "data": {
    "id": 2,
    "name": "测试",
    "code": "test"
  }
}
                </pre>
            </div>
            
            <h2>项目接口</h2>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/projects</h3>
                <p>获取项目列表</p>
                <p><strong>响应：</strong></p>
                <pre>
{
  "success": true,
  "message": "获取项目列表成功",
  "data": [
    {
      "id": 1,
      "name": "演示项目",
      "code": "default",
      "description": "系统演示项目"
    },
    {
      "id": 2,
      "name": "测试",
      "code": "test"
    }
  ]
}
                </pre>
            </div>
            
            <h2>配置接口</h2>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/currency-types?projectId=1</h3>
                <p>获取币种列表</p>
                <p><strong>响应：</strong></p>
                <pre>
{
  "success": true,
  "message": "获取currency_types列表成功",
  "data": [
    {
      "id": 1,
      "name": "人民币",
      "code": "CNY",
      "description": "中国法定货币",
      "project_id": 1
    },
    {
      "id": 2,
      "name": "美元",
      "code": "USD",
      "description": "美国法定货币",
      "project_id": 1
    }
  ]
}
                </pre>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/account-types?projectId=1</h3>
                <p>获取账户类型列表</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/asset-types?projectId=1</h3>
                <p>获取资产类型列表</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/subjects?projectId=1</h3>
                <p>获取科目列表</p>
            </div>
            
            <h2>账户接口</h2>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/accounts?projectId=1</h3>
                <p>获取账户列表</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method post">POST</span> /api/accounts</h3>
                <p>创建新账户</p>
            </div>
            
            <h2>交易接口</h2>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/transactions?projectId=1</h3>
                <p>获取交易列表</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method post">POST</span> /api/transactions</h3>
                <p>创建新交易</p>
            </div>
            
            <h2>仪表盘接口</h2>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/dashboard-data?projectId=1</h3>
                <p>获取仪表盘综合数据</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/account-summary?projectId=1</h3>
                <p>获取账户摘要数据</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/transaction-summary?projectId=1&period=month</h3>
                <p>获取交易摘要数据</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/income-by-subject?projectId=1&period=month</h3>
                <p>获取收入按科目分析数据</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/expense-by-subject?projectId=1&period=month</h3>
                <p>获取支出按科目分析数据</p>
            </div>
            
            <div class="endpoint">
                <h3><span class="method get">GET</span> /api/expense-by-department?projectId=1&period=month</h3>
                <p>获取支出按部门分析数据</p>
            </div>
            
        </body>
        </html>
        ';
        exit;
    
    // 默认情况
    default:
        sendResponse(404, '请求的API端点不存在');
}