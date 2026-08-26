<?php
/**
 * 配置控制器
 * 处理系统配置项的查询和管理，包括币种、账户类型、资产类型和科目
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

// 获取请求路径和查询参数
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$pathParts = explode('/', trim($path, '/'));
$endpoint = end($pathParts);
$query = parse_url($request_uri, PHP_URL_QUERY);
$params = [];
parse_str($query ?? '', $params);

// 获取项目ID（必需）
$projectId = isset($params['projectId']) ? (int)$params['projectId'] : 
             (isset($data['projectId']) ? (int)$data['projectId'] : null);

if (!$projectId) {
    sendResponse(400, '缺少项目ID');
}

// 对于GET请求，允许无需登录即可访问系统配置数据
// 对于其他请求方法（POST、PUT、DELETE），要求用户登录并验证权限
if ($method !== 'GET') {
    // 获取当前用户，验证身份
    $user = $auth->getCurrentUser();
    if (!$user) {
        sendResponse(401, '未授权访问');
    }
    
    // 检查用户是否有权限访问该项目
    if (!$auth->hasProjectAccess($user['id'], $projectId)) {
        sendResponse(403, '您没有权限访问该项目');
    }
}

// 确定配置表类型
$configType = '';
if (strpos($path, 'currency-types') !== false) {
    $configType = 'currency_types';
    $tableName = 'currency_types';
    $requiredFields = ['name', 'code'];
} elseif (strpos($path, 'account-types') !== false) {
    $configType = 'account_types';
    $tableName = 'account_types';
    $requiredFields = ['name'];
} elseif (strpos($path, 'asset-types') !== false) {
    $configType = 'asset_types';
    $tableName = 'asset_types';
    $requiredFields = ['name'];
} elseif (strpos($path, 'subjects') !== false) {
    $configType = 'subjects';
    $tableName = 'subjects';
    $requiredFields = ['name'];
} else {
    sendResponse(404, '配置类型不存在');
}

// 获取配置项ID（如果有的话）
$configId = isset($params['id']) ? (int)$params['id'] : null;

// 根据请求方法处理不同的操作
switch ($method) {
    // 获取配置项列表或单个配置项
    case 'GET':
        try {
            if ($configId) {
                // 获取单个配置项
                $query = "SELECT * FROM {$tableName} WHERE id = ? AND project_id = ? LIMIT 1";
                $stmt = $db->prepare($query);
                $stmt->execute([$configId, $projectId]);
                
                if ($stmt->rowCount() > 0) {
                    $configItem = $stmt->fetch();
                    sendResponse(200, "获取{$configType}成功", $configItem);
                } else {
                    sendResponse(404, "{$configType}不存在");
                }
            } else {
                // 获取配置项列表
                $query = "SELECT * FROM {$tableName} WHERE project_id = ? ORDER BY id";
                $stmt = $db->prepare($query);
                $stmt->execute([$projectId]);
                
                $configItems = [];
                while ($row = $stmt->fetch()) {
                    $configItems[] = $row;
                }
                
                sendResponse(200, "获取{$configType}列表成功", $configItems);
            }
        } catch (PDOException $e) {
            error_log("获取{$configType}错误: " . $e->getMessage());
            sendResponse(500, "获取{$configType}失败");
        }
        break;
    
    // 创建新配置项
    case 'POST':
        // 验证必要参数
        foreach ($requiredFields as $field) {
            if (empty($data[$field])) {
                sendResponse(400, "{$field}不能为空");
            }
        }
        
        try {
            // 检查是否已存在同名配置项
            $checkQuery = "SELECT id FROM {$tableName} WHERE name = ? AND project_id = ? LIMIT 1";
            $checkStmt = $db->prepare($checkQuery);
            $checkStmt->execute([$data['name'], $projectId]);
            
            if ($checkStmt->rowCount() > 0) {
                sendResponse(400, "已存在同名{$configType}");
            }
            
            // 构建插入字段和值
            $fields = ['project_id', 'created_at', 'updated_at'];
            $values = [$projectId, 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP'];
            $placeholders = ['?', 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP'];
            
            foreach ($data as $key => $value) {
                if ($key !== 'projectId') {
                    $fields[] = $key;
                    $values[] = $value;
                    $placeholders[] = '?';
                }
            }
            
            $fieldsStr = implode(', ', $fields);
            $placeholdersStr = implode(', ', $placeholders);
            
            // 创建配置项
            $query = "INSERT INTO {$tableName} ({$fieldsStr}) VALUES ({$placeholdersStr})";
            $stmt = $db->prepare($query);
            
            // 移除 CURRENT_TIMESTAMP 占位符的值
            $insertValues = array_filter($values, function($value) {
                return $value !== 'CURRENT_TIMESTAMP';
            });
            
            $stmt->execute($insertValues);
            
            $newId = $db->lastInsertId();
            
            // 获取新创建的配置项
            $query = "SELECT * FROM {$tableName} WHERE id = ? LIMIT 1";
            $stmt = $db->prepare($query);
            $stmt->execute([$newId]);
            $configItem = $stmt->fetch();
            
            sendResponse(201, "{$configType}创建成功", $configItem);
        } catch (PDOException $e) {
            error_log("创建{$configType}错误: " . $e->getMessage());
            sendResponse(500, "创建{$configType}失败");
        }
        break;
    
    // 更新配置项
    case 'PUT':
        // 需要配置项ID
        if (!$configId) {
            sendResponse(400, "缺少{$configType}ID");
        }
        
        try {
            // 验证配置项是否存在
            $checkQuery = "SELECT id FROM {$tableName} WHERE id = ? AND project_id = ? LIMIT 1";
            $checkStmt = $db->prepare($checkQuery);
            $checkStmt->execute([$configId, $projectId]);
            
            if ($checkStmt->rowCount() === 0) {
                sendResponse(404, "{$configType}不存在");
            }
            
            // 构建更新语句
            $updateParts = [];
            $updateValues = [];
            
            foreach ($data as $key => $value) {
                if ($key !== 'projectId' && $key !== 'id') {
                    $updateParts[] = "{$key} = ?";
                    $updateValues[] = $value;
                }
            }
            
            // 添加更新时间
            $updateParts[] = "updated_at = CURRENT_TIMESTAMP";
            
            // 添加ID和项目ID
            $updateValues[] = $configId;
            $updateValues[] = $projectId;
            
            $updatePartsStr = implode(', ', $updateParts);
            
            // 更新配置项
            $query = "UPDATE {$tableName} SET {$updatePartsStr} WHERE id = ? AND project_id = ?";
            $stmt = $db->prepare($query);
            $stmt->execute($updateValues);
            
            // 获取更新后的配置项
            $query = "SELECT * FROM {$tableName} WHERE id = ? LIMIT 1";
            $stmt = $db->prepare($query);
            $stmt->execute([$configId]);
            $configItem = $stmt->fetch();
            
            sendResponse(200, "{$configType}更新成功", $configItem);
        } catch (PDOException $e) {
            error_log("更新{$configType}错误: " . $e->getMessage());
            sendResponse(500, "更新{$configType}失败");
        }
        break;
    
    // 删除配置项
    case 'DELETE':
        // 需要配置项ID
        if (!$configId) {
            sendResponse(400, "缺少{$configType}ID");
        }
        
        try {
            // 验证配置项是否存在
            $checkQuery = "SELECT id FROM {$tableName} WHERE id = ? AND project_id = ? LIMIT 1";
            $checkStmt = $db->prepare($checkQuery);
            $checkStmt->execute([$configId, $projectId]);
            
            if ($checkStmt->rowCount() === 0) {
                sendResponse(404, "{$configType}不存在");
            }
            
            // 检查是否有关联数据
            // 币种类型 - 检查账户表
            if ($configType === 'currency_types') {
                $refQuery = "SELECT COUNT(*) as count FROM accounts WHERE currency_type = (SELECT code FROM currency_types WHERE id = ?) AND project_id = ?";
                $refStmt = $db->prepare($refQuery);
                $refStmt->execute([$configId, $projectId]);
                $refCount = $refStmt->fetch()['count'];
                
                if ($refCount > 0) {
                    sendResponse(400, "该币种已被账户使用，无法删除");
                }
            }
            // 账户类型 - 检查账户表
            else if ($configType === 'account_types') {
                $refQuery = "SELECT COUNT(*) as count FROM accounts WHERE account_type = (SELECT name FROM account_types WHERE id = ?) AND project_id = ?";
                $refStmt = $db->prepare($refQuery);
                $refStmt->execute([$configId, $projectId]);
                $refCount = $refStmt->fetch()['count'];
                
                if ($refCount > 0) {
                    sendResponse(400, "该账户类型已被账户使用，无法删除");
                }
            }
            // 资产类型 - 检查资产表
            else if ($configType === 'asset_types') {
                $refQuery = "SELECT COUNT(*) as count FROM assets WHERE asset_type_id = ? AND project_id = ?";
                $refStmt = $db->prepare($refQuery);
                $refStmt->execute([$configId, $projectId]);
                $refCount = $refStmt->fetch()['count'];
                
                if ($refCount > 0) {
                    sendResponse(400, "该资产类型已被资产使用，无法删除");
                }
            }
            // 科目 - 检查交易表
            else if ($configType === 'subjects') {
                $refQuery = "SELECT COUNT(*) as count FROM transactions WHERE subject_id = ? AND project_id = ?";
                $refStmt = $db->prepare($refQuery);
                $refStmt->execute([$configId, $projectId]);
                $refCount = $refStmt->fetch()['count'];
                
                if ($refCount > 0) {
                    sendResponse(400, "该科目已被交易使用，无法删除");
                }
            }
            
            // 删除配置项
            $query = "DELETE FROM {$tableName} WHERE id = ? AND project_id = ?";
            $stmt = $db->prepare($query);
            $stmt->execute([$configId, $projectId]);
            
            sendResponse(200, "{$configType}删除成功");
        } catch (PDOException $e) {
            error_log("删除{$configType}错误: " . $e->getMessage());
            sendResponse(500, "删除{$configType}失败");
        }
        break;
    
    default:
        sendResponse(405, '不支持的请求方法');
}