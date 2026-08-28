<?php
// 禁止直接访问此文件
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '禁止直接访问']);
    exit();
}
/**
 * 身份验证控制器
 * 处理登录、注册、用户信息和项目切换
 */
require_once __DIR__ . '/../config/config.php';

// 获取数据库连接
$database = new Database();
$db = $database->getConnection();

// 实例化认证工具
$auth = new Auth($db);

// 获取请求方法
$method = $_SERVER['REQUEST_METHOD'];

// 解析请求数据
$data = json_decode(file_get_contents("php://input"), true);

// 获取请求路径
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$endpoint = basename($path);

switch ($endpoint) {
    // 登录
    case 'login':
        if ($method === 'POST') {
            // 验证必要参数
            if (empty($data['username']) || empty($data['password'])) {
                sendResponse(400, '用户名和密码不能为空');
            }
            
            // 验证凭据
            $user = $auth->login($data['username'], $data['password']);
            
            if ($user) {
                // 获取可能的项目ID参数
                $projectId = $data['projectId'] ?? null;
                
                // 如果指定了项目ID并且用户有权限访问该项目
                if ($projectId && $auth->hasProjectAccess($user['id'], $projectId)) {
                    // 找到当前项目
                    foreach ($user['projectsList'] as $project) {
                        if ($project['id'] == $projectId) {
                            $user['currentProject'] = $project;
                            $user['projectId'] = $project['id'];
                            break;
                        }
                    }
                }
                
                sendResponse(200, '登录成功', $user);
            } else {
                sendResponse(401, '用户名或密码错误');
            }
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 注销
    case 'logout':
        sendResponse(200, '已成功注销');
        break;
    
    // 获取当前用户信息
    case 'user':
        if ($method === 'GET') {
            $user = $auth->getCurrentUser();
            
            if ($user) {
                sendResponse(200, '获取用户信息成功', $user);
            } else {
                sendResponse(401, '未授权访问');
            }
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 切换项目
    case 'switch-project':
        if ($method === 'POST') {
            // 验证必要参数
            if (empty($data['projectId'])) {
                sendResponse(400, '项目ID不能为空');
            }
            
            // 获取当前用户
            $user = $auth->getCurrentUser();
            if (!$user) {
                sendResponse(401, '未授权访问');
            }
            
            // 切换项目
            $project = $auth->switchProject($user['id'], $data['projectId']);
            
            if ($project) {
                sendResponse(200, "已切换到项目: {$project['name']}", $project);
            } else {
                sendResponse(403, '您没有权限访问该项目');
            }
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 注册新用户
    case 'register':
        if ($method === 'POST') {
            // 验证必要参数
            if (empty($data['username']) || empty($data['password'])) {
                sendResponse(400, '用户名和密码不能为空');
            }
            
            // 创建用户实例
            $user = new User($db);
            
            // 检查用户名是否已存在
            if ($user->findByUsername($data['username'])) {
                sendResponse(400, '用户名已存在');
            }
            
            // 设置用户属性
            $user->username = $data['username'];
            $user->password = $data['password'];
            $user->fullName = $data['fullName'] ?? '';
            $user->email = $data['email'] ?? '';
            $user->phone = $data['phone'] ?? '';
            $user->department = $data['department'] ?? '';
            $user->role = $data['role'] ?? 'user';
            $user->notes = $data['notes'] ?? '';
            $user->status = $data['status'] ?? 'active';
            $user->is_super_admin = false; // 新注册用户默认不是超级管理员
            $user->project_id = $data['projectId'] ?? 1; // 默认关联到项目1
            $user->active = true;
            
            // 创建用户
            if ($user->create()) {
                // 添加用户到项目
                $user->addToProject($user->project_id);
                
                // 调用登录方法自动登录
                $userData = $auth->login($data['username'], $data['password']);
                
                sendResponse(201, '用户注册成功', $userData);
            } else {
                sendResponse(500, '用户注册失败');
            }
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    default:
        sendResponse(404, '请求的API端点不存在');
}