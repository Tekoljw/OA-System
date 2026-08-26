<?php
/**
 * 交易控制器
 * 处理交易相关的API请求
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

// 确保用户已认证
$user = $auth->getCurrentUser();
if (!$user) {
    sendResponse(401, '未授权访问');
    exit;
}

// 从请求中获取项目ID
$projectId = $_GET['projectId'] ?? $user['projectId'] ?? null;
if (!$projectId) {
    sendResponse(400, '缺少项目ID参数');
    exit;
}

// 确保用户有项目访问权限
if (!$auth->hasProjectAccess($user['id'], $projectId)) {
    sendResponse(403, '您没有权限访问该项目');
    exit;
}

// 解析请求数据
$data = json_decode(file_get_contents("php://input"), true);

// 根据请求路径和方法处理不同的API操作
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$endpoint = basename($path);
$id = isset($_GET['id']) ? intval($_GET['id']) : null;

// 主要端点是transactions，所以检查ID是否存在来区分列表/详情/创建/更新操作
if ($endpoint === 'transactions') {
    switch ($method) {
        // 获取交易列表或单个交易详情
        case 'GET':
            if ($id) {
                // 获取单个交易详情
                $transaction = getTransaction($db, $id, $projectId);
                if ($transaction) {
                    sendResponse(200, '获取交易成功', $transaction);
                } else {
                    sendResponse(404, '交易不存在');
                }
            } else {
                // 获取交易列表，支持分页和筛选
                $page = isset($_GET['page']) ? intval($_GET['page']) : 1;
                $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 20;
                $filters = [
                    'type' => $_GET['type'] ?? null,
                    'subject_id' => $_GET['subject_id'] ?? null,
                    'account_id' => $_GET['account_id'] ?? null,
                    'department_id' => $_GET['department_id'] ?? null,
                    'start_date' => $_GET['start_date'] ?? null,
                    'end_date' => $_GET['end_date'] ?? null,
                    'min_amount' => $_GET['min_amount'] ?? null,
                    'max_amount' => $_GET['max_amount'] ?? null,
                    'search' => $_GET['search'] ?? null
                ];
                
                $transactions = getTransactions($db, $projectId, $page, $limit, $filters);
                $total = getTransactionsCount($db, $projectId, $filters);
                
                sendResponse(200, '获取交易列表成功', [
                    'data' => $transactions,
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => $total,
                        'pages' => ceil($total / $limit)
                    ]
                ]);
            }
            break;
        
        // 创建新交易
        case 'POST':
            // 验证必要字段
            if (empty($data['type']) || empty($data['amount']) || empty($data['account_id'])) {
                sendResponse(400, '缺少必要字段');
                break;
            }
            
            // 添加项目ID
            $data['project_id'] = $projectId;
            
            // 添加创建者ID
            $data['created_by'] = $user['id'];
            
            // 创建交易
            $result = createTransaction($db, $data);
            
            if ($result) {
                // 记录活动日志
                logActivity($db, 'create', 'transaction', $result['id'], $user['id'], $projectId, "创建了交易 #{$result['id']}");
                
                sendResponse(201, '交易创建成功', $result);
            } else {
                sendResponse(500, '交易创建失败');
            }
            break;
        
        // 更新交易
        case 'PUT':
            if (!$id) {
                sendResponse(400, '缺少交易ID');
                break;
            }
            
            // 检查交易是否存在且属于当前项目
            $transaction = getTransaction($db, $id, $projectId);
            if (!$transaction) {
                sendResponse(404, '交易不存在或无权访问');
                break;
            }
            
            // 执行更新
            $result = updateTransaction($db, $id, $data);
            
            if ($result) {
                // 记录活动日志
                logActivity($db, 'update', 'transaction', $id, $user['id'], $projectId, "更新了交易 #{$id}");
                
                sendResponse(200, '交易更新成功', $result);
            } else {
                sendResponse(500, '交易更新失败');
            }
            break;
        
        // 删除交易
        case 'DELETE':
            if (!$id) {
                sendResponse(400, '缺少交易ID');
                break;
            }
            
            // 检查交易是否存在且属于当前项目
            $transaction = getTransaction($db, $id, $projectId);
            if (!$transaction) {
                sendResponse(404, '交易不存在或无权访问');
                break;
            }
            
            // 执行删除
            $result = deleteTransaction($db, $id);
            
            if ($result) {
                // 记录活动日志
                logActivity($db, 'delete', 'transaction', $id, $user['id'], $projectId, "删除了交易 #{$id}");
                
                sendResponse(200, '交易删除成功');
            } else {
                sendResponse(500, '交易删除失败');
            }
            break;
        
        default:
            sendResponse(405, '不支持的请求方法');
    }
} else {
    sendResponse(404, '请求的API端点不存在');
}

/**
 * 获取单个交易详情
 * 
 * @param PDO $db 数据库连接
 * @param int $id 交易ID
 * @param int $projectId 项目ID
 * @return array|false 交易数据或false
 */
function getTransaction($db, $id, $projectId) {
    try {
        $query = "SELECT t.*, 
                    a.name as account_name, 
                    s.name as subject_name,
                    d.name as department_name,
                    u.username as created_by_username
                  FROM transactions t
                  LEFT JOIN accounts a ON t.account_id = a.id
                  LEFT JOIN subjects s ON t.subject_id = s.id
                  LEFT JOIN departments d ON t.department_id = d.id
                  LEFT JOIN users u ON t.created_by = u.id
                  WHERE t.id = ? AND t.project_id = ?";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$id, $projectId]);
        
        if ($stmt->rowCount() > 0) {
            $transaction = $stmt->fetch(PDO::FETCH_ASSOC);
            
            // 转换数值类型
            $transaction['amount'] = floatval($transaction['amount']);
            
            return $transaction;
        }
        
        return false;
    } catch (PDOException $e) {
        error_log("获取交易错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 获取交易列表
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param int $page 页码
 * @param int $limit 每页记录数
 * @param array $filters 过滤条件
 * @return array 交易列表
 */
function getTransactions($db, $projectId, $page = 1, $limit = 20, $filters = []) {
    try {
        $offset = ($page - 1) * $limit;
        
        $whereConditions = ["t.project_id = ?"];
        $params = [$projectId];
        
        // 应用过滤条件
        if (!empty($filters['type'])) {
            $whereConditions[] = "t.type = ?";
            $params[] = $filters['type'];
        }
        
        if (!empty($filters['subject_id'])) {
            $whereConditions[] = "t.subject_id = ?";
            $params[] = $filters['subject_id'];
        }
        
        if (!empty($filters['account_id'])) {
            $whereConditions[] = "t.account_id = ?";
            $params[] = $filters['account_id'];
        }
        
        if (!empty($filters['department_id'])) {
            $whereConditions[] = "t.department_id = ?";
            $params[] = $filters['department_id'];
        }
        
        if (!empty($filters['start_date'])) {
            $whereConditions[] = "t.transaction_date >= ?";
            $params[] = $filters['start_date'];
        }
        
        if (!empty($filters['end_date'])) {
            $whereConditions[] = "t.transaction_date <= ?";
            $params[] = $filters['end_date'];
        }
        
        if (!empty($filters['min_amount'])) {
            $whereConditions[] = "t.amount >= ?";
            $params[] = $filters['min_amount'];
        }
        
        if (!empty($filters['max_amount'])) {
            $whereConditions[] = "t.amount <= ?";
            $params[] = $filters['max_amount'];
        }
        
        if (!empty($filters['search'])) {
            $searchTerm = "%" . $filters['search'] . "%";
            $whereConditions[] = "(t.description LIKE ? OR a.name LIKE ? OR s.name LIKE ? OR d.name LIKE ?)";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        $whereClause = implode(" AND ", $whereConditions);
        
        $query = "SELECT t.*, 
                    a.name as account_name, 
                    s.name as subject_name,
                    d.name as department_name,
                    u.username as created_by_username
                  FROM transactions t
                  LEFT JOIN accounts a ON t.account_id = a.id
                  LEFT JOIN subjects s ON t.subject_id = s.id
                  LEFT JOIN departments d ON t.department_id = d.id
                  LEFT JOIN users u ON t.created_by = u.id
                  WHERE $whereClause
                  ORDER BY t.transaction_date DESC, t.id DESC
                  LIMIT ? OFFSET ?";
        
        $params[] = $limit;
        $params[] = $offset;
        
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        
        $transactions = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // 转换数值类型
            $row['amount'] = floatval($row['amount']);
            $transactions[] = $row;
        }
        
        return $transactions;
    } catch (PDOException $e) {
        error_log("获取交易列表错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 获取交易总数
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param array $filters 过滤条件
 * @return int 交易总数
 */
function getTransactionsCount($db, $projectId, $filters = []) {
    try {
        $whereConditions = ["t.project_id = ?"];
        $params = [$projectId];
        
        // 应用过滤条件
        if (!empty($filters['type'])) {
            $whereConditions[] = "t.type = ?";
            $params[] = $filters['type'];
        }
        
        if (!empty($filters['subject_id'])) {
            $whereConditions[] = "t.subject_id = ?";
            $params[] = $filters['subject_id'];
        }
        
        if (!empty($filters['account_id'])) {
            $whereConditions[] = "t.account_id = ?";
            $params[] = $filters['account_id'];
        }
        
        if (!empty($filters['department_id'])) {
            $whereConditions[] = "t.department_id = ?";
            $params[] = $filters['department_id'];
        }
        
        if (!empty($filters['start_date'])) {
            $whereConditions[] = "t.transaction_date >= ?";
            $params[] = $filters['start_date'];
        }
        
        if (!empty($filters['end_date'])) {
            $whereConditions[] = "t.transaction_date <= ?";
            $params[] = $filters['end_date'];
        }
        
        if (!empty($filters['min_amount'])) {
            $whereConditions[] = "t.amount >= ?";
            $params[] = $filters['min_amount'];
        }
        
        if (!empty($filters['max_amount'])) {
            $whereConditions[] = "t.amount <= ?";
            $params[] = $filters['max_amount'];
        }
        
        if (!empty($filters['search'])) {
            $searchTerm = "%" . $filters['search'] . "%";
            $whereConditions[] = "(t.description LIKE ? OR a.name LIKE ? OR s.name LIKE ? OR d.name LIKE ?)";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }
        
        $whereClause = implode(" AND ", $whereConditions);
        
        $query = "SELECT COUNT(*) as total
                  FROM transactions t
                  LEFT JOIN accounts a ON t.account_id = a.id
                  LEFT JOIN subjects s ON t.subject_id = s.id
                  LEFT JOIN departments d ON t.department_id = d.id
                  WHERE $whereClause";
        
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        return intval($result['total'] ?? 0);
    } catch (PDOException $e) {
        error_log("获取交易总数错误: " . $e->getMessage());
        return 0;
    }
}

/**
 * 创建新交易
 * 
 * @param PDO $db 数据库连接
 * @param array $data 交易数据
 * @return array|false 创建的交易数据或false
 */
function createTransaction($db, $data) {
    try {
        // 开始事务
        $db->beginTransaction();
        
        // 准备插入交易的SQL
        $query = "INSERT INTO transactions (
                    project_id, type, amount, account_id, subject_id, department_id,
                    transaction_date, description, reference_number, created_by, created_at
                  ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
                  ) RETURNING id";
        
        $stmt = $db->prepare($query);
        $stmt->execute([
            $data['project_id'],
            $data['type'],
            $data['amount'],
            $data['account_id'],
            $data['subject_id'] ?? null,
            $data['department_id'] ?? null,
            $data['transaction_date'] ?? date('Y-m-d'),
            $data['description'] ?? null,
            $data['reference_number'] ?? null,
            $data['created_by']
        ]);
        
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $transactionId = $result['id'];
        
        // 更新账户余额
        $updateQuery = "UPDATE accounts SET 
                        balance = balance + CASE 
                            WHEN ? = 'income' THEN ? 
                            WHEN ? = 'expense' THEN -? 
                            ELSE 0 
                        END,
                        updated_at = NOW()
                      WHERE id = ?";
        
        $updateStmt = $db->prepare($updateQuery);
        $updateStmt->execute([
            $data['type'],
            $data['amount'],
            $data['type'],
            $data['amount'],
            $data['account_id']
        ]);
        
        // 提交事务
        $db->commit();
        
        // 获取完整的交易数据
        return getTransaction($db, $transactionId, $data['project_id']);
    } catch (PDOException $e) {
        // 回滚事务
        $db->rollBack();
        error_log("创建交易错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 更新交易
 * 
 * @param PDO $db 数据库连接
 * @param int $id 交易ID
 * @param array $data 更新的数据
 * @return array|false 更新后的交易数据或false
 */
function updateTransaction($db, $id, $data) {
    try {
        // 先获取原交易数据
        $query = "SELECT * FROM transactions WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$id]);
        $oldTransaction = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$oldTransaction) {
            return false;
        }
        
        // 开始事务
        $db->beginTransaction();
        
        // 如果金额或类型或账户变化，需要调整账户余额
        $amountChanged = isset($data['amount']) && $data['amount'] != $oldTransaction['amount'];
        $typeChanged = isset($data['type']) && $data['type'] != $oldTransaction['type'];
        $accountChanged = isset($data['account_id']) && $data['account_id'] != $oldTransaction['account_id'];
        
        if ($amountChanged || $typeChanged || $accountChanged) {
            // 恢复旧账户余额
            $restoreQuery = "UPDATE accounts SET 
                            balance = balance - CASE 
                                WHEN ? = 'income' THEN ? 
                                WHEN ? = 'expense' THEN -? 
                                ELSE 0 
                            END,
                            updated_at = NOW()
                          WHERE id = ?";
            
            $restoreStmt = $db->prepare($restoreQuery);
            $restoreStmt->execute([
                $oldTransaction['type'],
                $oldTransaction['amount'],
                $oldTransaction['type'],
                $oldTransaction['amount'],
                $oldTransaction['account_id']
            ]);
            
            // 更新新账户余额
            $newAccountId = $data['account_id'] ?? $oldTransaction['account_id'];
            $newType = $data['type'] ?? $oldTransaction['type'];
            $newAmount = $data['amount'] ?? $oldTransaction['amount'];
            
            $updateQuery = "UPDATE accounts SET 
                            balance = balance + CASE 
                                WHEN ? = 'income' THEN ? 
                                WHEN ? = 'expense' THEN -? 
                                ELSE 0 
                            END,
                            updated_at = NOW()
                          WHERE id = ?";
            
            $updateStmt = $db->prepare($updateQuery);
            $updateStmt->execute([
                $newType,
                $newAmount,
                $newType,
                $newAmount,
                $newAccountId
            ]);
        }
        
        // 更新交易记录
        $fields = [];
        $params = [];
        
        foreach ($data as $key => $value) {
            if ($key !== 'id' && $key !== 'project_id' && $key !== 'created_by' && $key !== 'created_at') {
                $fields[] = "$key = ?";
                $params[] = $value;
            }
        }
        
        $params[] = $id;
        
        $updateTransactionQuery = "UPDATE transactions SET " . implode(", ", $fields) . ", updated_at = NOW() WHERE id = ?";
        $updateTransactionStmt = $db->prepare($updateTransactionQuery);
        $updateTransactionStmt->execute($params);
        
        // 提交事务
        $db->commit();
        
        // 获取更新后的交易数据
        return getTransaction($db, $id, $oldTransaction['project_id']);
    } catch (PDOException $e) {
        // 回滚事务
        $db->rollBack();
        error_log("更新交易错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 删除交易
 * 
 * @param PDO $db 数据库连接
 * @param int $id 交易ID
 * @return bool 删除成功返回true，否则返回false
 */
function deleteTransaction($db, $id) {
    try {
        // 先获取交易数据
        $query = "SELECT * FROM transactions WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$id]);
        $transaction = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$transaction) {
            return false;
        }
        
        // 开始事务
        $db->beginTransaction();
        
        // 恢复账户余额
        $updateQuery = "UPDATE accounts SET 
                        balance = balance - CASE 
                            WHEN ? = 'income' THEN ? 
                            WHEN ? = 'expense' THEN -? 
                            ELSE 0 
                        END,
                        updated_at = NOW()
                      WHERE id = ?";
        
        $updateStmt = $db->prepare($updateQuery);
        $updateStmt->execute([
            $transaction['type'],
            $transaction['amount'],
            $transaction['type'],
            $transaction['amount'],
            $transaction['account_id']
        ]);
        
        // 删除交易记录
        $deleteQuery = "DELETE FROM transactions WHERE id = ?";
        $deleteStmt = $db->prepare($deleteQuery);
        $deleteStmt->execute([$id]);
        
        // 提交事务
        $db->commit();
        
        return true;
    } catch (PDOException $e) {
        // 回滚事务
        $db->rollBack();
        error_log("删除交易错误: " . $e->getMessage());
        return false;
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