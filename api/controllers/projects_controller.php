<?php
// 禁止直接访问此文件
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '禁止直接访问']);
    exit();
}
/**
 * 项目控制器
 * 处理项目创建、查询和管理
 */
require_once __DIR__ . '/../config/config.php';

// 获取数据库连接
$database = new Database();
$db = $database->getConnection();

// 实例化认证工具
$auth = new Auth($db);

// 实例化项目模型
$project = new Project($db);

// 获取请求方法
$method = $_SERVER['REQUEST_METHOD'];

// 解析请求数据
$data = json_decode(file_get_contents("php://input"), true);

// 获取当前用户，验证身份
$user = $auth->getCurrentUser();
if (!$user) {
    sendResponse(401, '未授权访问');
}

// 获取请求路径和查询参数
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$endpoint = basename($path);
$query = parse_url($request_uri, PHP_URL_QUERY);
$params = [];
parse_str($query ?? '', $params);

// 获取项目ID（如果有的话）
$projectId = isset($params['id']) ? (int)$params['id'] : null;

// 根据请求方法处理不同的操作
switch ($method) {
    // 获取项目列表或单个项目
    case 'GET':
        if ($projectId) {
            // 获取单个项目
            if ($project->readOne($projectId)) {
                // 检查用户是否有权限访问该项目
                if ($auth->hasProjectAccess($user['id'], $projectId)) {
                    sendResponse(200, '获取项目成功', [
                        'id' => $project->id,
                        'name' => $project->name,
                        'code' => $project->code,
                        'description' => $project->description,
                        'active' => $project->active,
                        'created_at' => $project->created_at,
                        'updated_at' => $project->updated_at,
                        'created_by_id' => $project->created_by_id
                    ]);
                } else {
                    sendResponse(403, '您没有权限访问该项目');
                }
            } else {
                sendResponse(404, '项目不存在');
            }
        } else {
            // 获取项目列表
            if ($user['isSuperAdmin']) {
                // 超级管理员可以查看所有项目
                $projects = $project->readAll();
            } else {
                // 普通用户只能查看自己有权限的项目
                $projects = $user['projectsList'] ?? [];
            }
            
            sendResponse(200, '获取项目列表成功', $projects);
        }
        break;
    
    // 创建新项目
    case 'POST':
        // 只有超级管理员可以创建项目
        if (!$user['isSuperAdmin']) {
            sendResponse(403, '只有超级管理员可以创建项目');
        }
        
        // 验证必要参数
        if (empty($data['name']) || empty($data['code'])) {
            sendResponse(400, '项目名称和代码不能为空');
        }
        
        // 设置项目属性
        $project->name = $data['name'];
        $project->code = $data['code'];
        $project->description = $data['description'] ?? '';
        $project->active = isset($data['active']) ? (bool)$data['active'] : true;
        $project->created_by_id = $user['id'];
        
        // 创建项目
        if ($project->create()) {
            // 项目创建成功后，将当前用户添加到该项目
            $project->addUser($user['id']);
            
            // 为新项目初始化基础配置
            $project->initializeConfig();
            
            sendResponse(201, '项目创建成功', [
                'id' => $project->id,
                'name' => $project->name,
                'code' => $project->code,
                'description' => $project->description,
                'active' => $project->active,
                'created_at' => $project->created_at,
                'updated_at' => $project->updated_at,
                'created_by_id' => $project->created_by_id
            ]);
        } else {
            sendResponse(500, '项目创建失败');
        }
        break;
    
    // 更新项目
    case 'PUT':
        // 需要项目ID
        if (!$projectId) {
            sendResponse(400, '缺少项目ID');
        }
        
        // 只有超级管理员可以更新项目
        if (!$user['isSuperAdmin']) {
            sendResponse(403, '只有超级管理员可以更新项目');
        }
        
        // 验证项目是否存在
        if (!$project->readOne($projectId)) {
            sendResponse(404, '项目不存在');
        }
        
        // 设置项目属性
        if (isset($data['name'])) $project->name = $data['name'];
        if (isset($data['code'])) $project->code = $data['code'];
        if (isset($data['description'])) $project->description = $data['description'];
        if (isset($data['active'])) $project->active = (bool)$data['active'];
        
        // 更新项目
        if ($project->update()) {
            sendResponse(200, '项目更新成功', [
                'id' => $project->id,
                'name' => $project->name,
                'code' => $project->code,
                'description' => $project->description,
                'active' => $project->active,
                'created_at' => $project->created_at,
                'updated_at' => $project->updated_at,
                'created_by_id' => $project->created_by_id
            ]);
        } else {
            sendResponse(500, '项目更新失败');
        }
        break;
    
    // 添加或移除项目用户
    case 'PATCH':
        // 需要项目ID
        if (!$projectId) {
            sendResponse(400, '缺少项目ID');
        }
        
        // 只有超级管理员可以管理项目用户
        if (!$user['isSuperAdmin']) {
            sendResponse(403, '只有超级管理员可以管理项目用户');
        }
        
        // 验证项目是否存在
        if (!$project->readOne($projectId)) {
            sendResponse(404, '项目不存在');
        }
        
        // 确认操作类型和用户ID
        $action = $data['action'] ?? '';
        $targetUserId = $data['userId'] ?? null;
        
        if (empty($action) || !$targetUserId) {
            sendResponse(400, '缺少操作类型或用户ID');
        }
        
        // 执行相应操作
        if ($action === 'addUser') {
            // 添加用户到项目
            if ($project->addUser($targetUserId)) {
                sendResponse(200, '已将用户添加到项目');
            } else {
                sendResponse(500, '添加用户到项目失败');
            }
        } else if ($action === 'removeUser') {
            // 从项目中移除用户
            if ($project->removeUser($targetUserId)) {
                sendResponse(200, '已从项目中移除用户');
            } else {
                sendResponse(500, '从项目中移除用户失败');
            }
        } else {
            sendResponse(400, '不支持的操作类型');
        }
        break;
    
    default:
        sendResponse(405, '不支持的请求方法');
}