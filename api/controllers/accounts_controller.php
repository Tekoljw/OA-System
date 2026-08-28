<?php
// 禁止直接访问此文件
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '禁止直接访问']);
    exit();
}
/**
 * 账户控制器
 * 处理账户相关的API请求
 */
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../utils/auth.php';

// 获取数据库连接
$database = new Database();
$db = $database->getConnection();

// 实例化认证工具
$auth = new Auth($db);

// 获取请求方法
$method = $_SERVER['REQUEST_METHOD'];

// 从请求中获取项目ID
$projectId = $_GET['projectId'] ?? null;

// 对于GET请求，允许无需登录即可访问公共数据
if ($method === 'GET') {
    if (!$projectId) {
        sendResponse(400, '缺少项目ID参数');
        exit;
    }
    
    // 对于GET请求，不需要检查用户权限
    $user = $auth->getCurrentUser(); // 可选获取用户，但不强制要求
} else {
    // 对于非GET请求，确保用户已认证
    $user = $auth->getCurrentUser();
    if (!$user) {
        sendResponse(401, '未授权访问');
        exit;
    }
    
    // 使用用户的项目ID作为备选
    $projectId = $projectId ?? $user['projectId'] ?? null;
    if (!$projectId) {
        sendResponse(400, '缺少项目ID参数');
        exit;
    }
    
    // 确保用户有项目访问权限
    if (!$auth->hasProjectAccess($user['id'], $projectId)) {
        sendResponse(403, '您没有权限访问该项目');
        exit;
    }
}

// 解析请求数据
$data = json_decode(file_get_contents("php://input"), true);

// 根据请求路径和方法处理不同的API操作
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$endpoint = basename($path);
$id = isset($_GET['id']) ? intval($_GET['id']) : null;

// 主要端点是accounts，所以检查ID是否存在来区分列表/详情/创建/更新操作
if ($endpoint === 'accounts') {
    switch ($method) {
        // 获取账户列表或单个账户详情
        case 'GET':
            if ($id) {
                // 获取单个账户详情
                $account = getAccount($db, $id, $projectId);
                if ($account) {
                    sendResponse(200, '获取账户成功', $account);
                } else {
                    sendResponse(404, '账户不存在');
                }
            } else {
                // 获取账户列表，支持筛选
                $filters = [
                    'account_type_id' => $_GET['account_type_id'] ?? null,
                    'search' => $_GET['search'] ?? null,
                    'status' => $_GET['status'] ?? null
                ];
                
                $accounts = getAccounts($db, $projectId, $filters);
                sendResponse(200, '获取账户列表成功', $accounts);
            }
            break;
        
        // 创建新账户
        case 'POST':
            // 验证必要字段
            if (empty($data['name']) || empty($data['account_type_id'])) {
                sendResponse(400, '缺少必要字段');
                break;
            }
            
            // 添加项目ID
            $data['project_id'] = $projectId;
            
            // 添加创建者ID
            $data['created_by'] = $user['id'];
            
            // 创建账户
            $result = createAccount($db, $data);
            
            if ($result) {
                // 记录活动日志
                logActivity($db, 'create', 'account', $result['id'], $user['id'], $projectId, "创建了账户 {$result['name']}");
                
                sendResponse(201, '账户创建成功', $result);
            } else {
                sendResponse(500, '账户创建失败');
            }
            break;
        
        // 更新账户
        case 'PUT':
            if (!$id) {
                sendResponse(400, '缺少账户ID');
                break;
            }
            
            // 检查账户是否存在且属于当前项目
            $account = getAccount($db, $id, $projectId);
            if (!$account) {
                sendResponse(404, '账户不存在或无权访问');
                break;
            }
            
            // 执行更新
            $result = updateAccount($db, $id, $data);
            
            if ($result) {
                // 记录活动日志
                logActivity($db, 'update', 'account', $id, $user['id'], $projectId, "更新了账户 {$result['name']}");
                
                sendResponse(200, '账户更新成功', $result);
            } else {
                sendResponse(500, '账户更新失败');
            }
            break;
        
        // 删除账户
        case 'DELETE':
            if (!$id) {
                sendResponse(400, '缺少账户ID');
                break;
            }
            
            // 检查账户是否存在且属于当前项目
            $account = getAccount($db, $id, $projectId);
            if (!$account) {
                sendResponse(404, '账户不存在或无权访问');
                break;
            }
            
            // 检查账户是否有关联交易
            if (hasRelatedTransactions($db, $id)) {
                sendResponse(400, '无法删除有关联交易的账户');
                break;
            }
            
            // 执行删除
            $result = deleteAccount($db, $id);
            
            if ($result) {
                // 记录活动日志
                logActivity($db, 'delete', 'account', $id, $user['id'], $projectId, "删除了账户 {$account['name']}");
                
                sendResponse(200, '账户删除成功');
            } else {
                sendResponse(500, '账户删除失败');
            }
            break;
        
        default:
            sendResponse(405, '不支持的请求方法');
    }
} else if ($endpoint === 'account-types') {
    // 获取账户类型列表
    if ($method === 'GET') {
        $accountTypes = getAccountTypes($db, $projectId);
        sendResponse(200, '获取账户类型列表成功', $accountTypes);
    } else {
        sendResponse(405, '不支持的请求方法');
    }
} else {
    sendResponse(404, '请求的API端点不存在');
}

/**
 * 获取单个账户详情
 * 
 * @param PDO $db 数据库连接
 * @param int $id 账户ID
 * @param int $projectId 项目ID
 * @return array|false 账户数据或false
 */
function getAccount($db, $id, $projectId) {
    try {
        $query = "SELECT a.*, 
                    at.name as account_type_name, 
                    at.code as account_type_code,
                    at.type as account_type
                  FROM accounts a
                  JOIN account_types at ON a.account_type = at.name
                  WHERE a.id = ? AND a.project_id = ?";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$id, $projectId]);
        
        if ($stmt->rowCount() > 0) {
            $account = $stmt->fetch(PDO::FETCH_ASSOC);
            
            // 转换数值类型
            $account['balance'] = floatval($account['balance']);
            $account['initial_balance'] = floatval($account['initial_balance']);
            
            return $account;
        }
        
        return false;
    } catch (PDOException $e) {
        error_log("获取账户错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 获取账户列表
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param array $filters 过滤条件
 * @return array 账户列表
 */
function getAccounts($db, $projectId, $filters = []) {
    try {
        $whereConditions = ["a.project_id = ?"];
        $params = [$projectId];
        
        // 应用过滤条件
        if (!empty($filters['account_type_id'])) {
            $whereConditions[] = "a.account_type = ?";
            $params[] = $filters['account_type_id'];
        }
        
        if (!empty($filters['status'])) {
            $whereConditions[] = "a.status = ?";
            $params[] = $filters['status'];
        }
        
        if (!empty($filters['search'])) {
            $searchTerm = "%" . $filters['search'] . "%";
            $whereConditions[] = "(a.name LIKE ? OR a.account_number LIKE ? OR a.description LIKE ?)";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        $whereClause = implode(" AND ", $whereConditions);
        
        // 修复SQL查询，使用正确的列名
        $query = "SELECT a.*, 
                    at.name as account_type_name, 
                    at.code as account_type_code,
                    at.type as account_type
                  FROM accounts a
                  JOIN account_types at ON a.account_type = at.name
                  WHERE $whereClause
                  ORDER BY a.name ASC";
        
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        
        $accounts = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // 转换数值类型
            $row['balance'] = floatval($row['balance']);
            $row['initial_balance'] = floatval($row['initial_balance']);
            $accounts[] = $row;
        }
        
        return $accounts;
    } catch (PDOException $e) {
        error_log("获取账户列表错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 创建新账户
 * 
 * @param PDO $db 数据库连接
 * @param array $data 账户数据
 * @return array|false 创建的账户数据或false
 */
function createAccount($db, $data) {
    try {
        // 准备默认值
        $initialBalance = $data['initial_balance'] ?? 0;
        $currency = $data['currency_id'] ?? 1; // 默认货币
        $status = $data['status'] ?? 'active';
        
        // 获取账户类型
        $query = "SELECT type FROM account_types WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$data['account_type_id']]);
        $accountType = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // 如果是负债账户，初始余额应该是负数
        if ($accountType && $accountType['type'] === 'liability' && $initialBalance > 0) {
            $initialBalance = -$initialBalance;
        }
        
        // 创建新账户
        $query = "INSERT INTO accounts (
                    name, account_number, description, account_type_id,
                    currency_id, initial_balance, balance, status,
                    open_date, project_id, created_by, created_at
                  ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, NOW()
                  ) RETURNING id";
        
        $stmt = $db->prepare($query);
        $stmt->execute([
            $data['name'],
            $data['account_number'] ?? null,
            $data['description'] ?? null,
            $data['account_type_id'],
            $currency,
            $initialBalance,
            $initialBalance, // 初始时余额等于初始余额
            $status,
            $data['open_date'] ?? date('Y-m-d'),
            $data['project_id'],
            $data['created_by']
        ]);
        
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $accountId = $result['id'];
        
        // 如果有初始余额，创建一个初始余额交易
        if ($initialBalance != 0) {
            $transactionType = $initialBalance > 0 ? 'income' : 'expense';
            $transactionAmount = abs($initialBalance);
            
            $query = "INSERT INTO transactions (
                        project_id, type, amount, account_id,
                        transaction_date, description, created_by, created_at
                      ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, NOW()
                      )";
            
            $stmt = $db->prepare($query);
            $stmt->execute([
                $data['project_id'],
                $transactionType,
                $transactionAmount,
                $accountId,
                date('Y-m-d'),
                '初始余额',
                $data['created_by']
            ]);
        }
        
        // 获取完整的账户数据
        return getAccount($db, $accountId, $data['project_id']);
    } catch (PDOException $e) {
        error_log("创建账户错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 更新账户
 * 
 * @param PDO $db 数据库连接
 * @param int $id 账户ID
 * @param array $data 更新的数据
 * @return array|false 更新后的账户数据或false
 */
function updateAccount($db, $id, $data) {
    try {
        // 获取当前账户信息
        $query = "SELECT * FROM accounts WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$id]);
        $currentAccount = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$currentAccount) {
            return false;
        }
        
        // 准备更新字段
        $fields = [];
        $params = [];
        
        foreach ($data as $key => $value) {
            // 不允许直接修改余额和项目ID
            if ($key !== 'id' && $key !== 'balance' && $key !== 'project_id' && $key !== 'created_by' && $key !== 'created_at') {
                $fields[] = "$key = ?";
                $params[] = $value;
            }
        }
        
        if (empty($fields)) {
            // 没有有效字段需要更新
            return getAccount($db, $id, $currentAccount['project_id']);
        }
        
        $params[] = $id;
        
        // 执行更新
        $query = "UPDATE accounts SET " . implode(", ", $fields) . ", updated_at = NOW() WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        
        // 获取更新后的账户数据
        return getAccount($db, $id, $currentAccount['project_id']);
    } catch (PDOException $e) {
        error_log("更新账户错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 删除账户
 * 
 * @param PDO $db 数据库连接
 * @param int $id 账户ID
 * @return bool 删除成功返回true，否则返回false
 */
function deleteAccount($db, $id) {
    try {
        $query = "DELETE FROM accounts WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$id]);
        
        return $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        error_log("删除账户错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 检查账户是否有关联交易
 * 
 * @param PDO $db 数据库连接
 * @param int $accountId 账户ID
 * @return bool 有关联交易返回true，否则返回false
 */
function hasRelatedTransactions($db, $accountId) {
    try {
        $query = "SELECT COUNT(*) as count FROM transactions WHERE account_id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$accountId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        return intval($result['count']) > 0;
    } catch (PDOException $e) {
        error_log("检查关联交易错误: " . $e->getMessage());
        return true; // 出错时保守返回true，防止误删
    }
}

/**
 * 获取账户类型列表
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @return array 账户类型列表
 */
function getAccountTypes($db, $projectId) {
    try {
        $query = "SELECT * FROM account_types WHERE project_id = ? OR project_id IS NULL ORDER BY type, name";
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId]);
        
        $accountTypes = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $accountTypes[] = $row;
        }
        
        return $accountTypes;
    } catch (PDOException $e) {
        error_log("获取账户类型错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 记录活动日志
 * 
 * @param PDO $db 数据库连接
 * @param string $action 动作类型
 * @param string $target_type 目标类型
 * @param int $target_id 目标ID
 * @param int $user_id 用户ID
 * @param int $project_id 项目ID
 * @param string $description 描述
 * @return bool 成功返回true，失败返回false
 */
function logActivity($db, $action, $target_type, $target_id, $user_id, $project_id, $description) {
    try {
        $query = "INSERT INTO activity_logs (
                    action, target_type, target_id, user_id, project_id, description, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, NOW())";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$action, $target_type, $target_id, $user_id, $project_id, $description]);
        
        return true;
    } catch (PDOException $e) {
        error_log("记录活动日志错误: " . $e->getMessage());
        return false;
    }
}