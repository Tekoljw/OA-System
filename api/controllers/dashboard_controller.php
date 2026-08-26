<?php
/**
 * 仪表盘控制器
 * 处理仪表盘数据相关的API请求
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

// 根据请求路径处理不同的API端点
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$endpoint = basename($path);

switch ($endpoint) {
    // 获取账户摘要数据
    case 'account-summary':
        if ($method === 'GET') {
            // 获取账户总资产、总负债、净资产和现金余额
            $summary = getAccountSummary($db, $projectId);
            sendResponse(200, '获取账户摘要成功', $summary);
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 获取交易摘要数据
    case 'transaction-summary':
        if ($method === 'GET') {
            $period = $_GET['period'] ?? 'month';
            $summary = getTransactionSummary($db, $projectId, $period);
            sendResponse(200, '获取交易摘要成功', $summary);
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 获取收入按科目分析数据
    case 'income-by-subject':
        if ($method === 'GET') {
            $period = $_GET['period'] ?? 'month';
            $data = getIncomeBySubject($db, $projectId, $period);
            sendResponse(200, '获取收入科目分析成功', $data);
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 获取支出按科目分析数据
    case 'expense-by-subject':
        if ($method === 'GET') {
            $period = $_GET['period'] ?? 'month';
            $data = getExpenseBySubject($db, $projectId, $period);
            sendResponse(200, '获取支出科目分析成功', $data);
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 获取支出按部门分析数据
    case 'expense-by-department':
        if ($method === 'GET') {
            $period = $_GET['period'] ?? 'month';
            $data = getExpenseByDepartment($db, $projectId, $period);
            sendResponse(200, '获取部门支出分析成功', $data);
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    // 获取综合仪表盘数据
    case 'dashboard-data':
        if ($method === 'GET') {
            $period = $_GET['period'] ?? 'month';
            $data = getDashboardData($db, $projectId, $period);
            sendResponse(200, '获取仪表盘数据成功', $data);
        } else {
            sendResponse(405, '不支持的请求方法');
        }
        break;
    
    default:
        sendResponse(404, '请求的API端点不存在');
}

/**
 * 获取账户摘要数据
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @return array 账户摘要数据
 */
function getAccountSummary($db, $projectId) {
    try {
        // 获取总资产和总负债
        $query = "SELECT 
                    SUM(CASE WHEN at.type = 'asset' THEN a.balance ELSE 0 END) as total_assets,
                    SUM(CASE WHEN at.type = 'liability' THEN a.balance ELSE 0 END) as total_liabilities
                  FROM 
                    accounts a
                  JOIN 
                    account_types at ON a.account_type_id = at.id
                  WHERE 
                    a.project_id = ?";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $totalAssets = floatval($result['total_assets'] ?? 0);
        $totalLiabilities = floatval($result['total_liabilities'] ?? 0);
        $netWorth = $totalAssets - $totalLiabilities;
        
        // 获取现金余额
        $query = "SELECT 
                    SUM(a.balance) as cash_balance
                  FROM 
                    accounts a
                  JOIN 
                    account_types at ON a.account_type_id = at.id
                  WHERE 
                    a.project_id = ? AND at.code = 'cash'";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId]);
        $cashResult = $stmt->fetch(PDO::FETCH_ASSOC);
        $cashBalance = floatval($cashResult['cash_balance'] ?? 0);
        
        return [
            'totalAssets' => $totalAssets,
            'totalLiabilities' => $totalLiabilities,
            'netWorth' => $netWorth,
            'cashBalance' => $cashBalance
        ];
    } catch (PDOException $e) {
        error_log("获取账户摘要错误: " . $e->getMessage());
        return [
            'totalAssets' => 0,
            'totalLiabilities' => 0,
            'netWorth' => 0,
            'cashBalance' => 0
        ];
    }
}

/**
 * 获取交易摘要数据
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param string $period 周期（day：日报，month：月报）
 * @return array 交易摘要数据
 */
function getTransactionSummary($db, $projectId, $period) {
    try {
        $dateFormat = ($period === 'day') ? 'YYYY-MM-DD' : 'YYYY-MM';
        $groupBy = ($period === 'day') ? 'DATE(t.transaction_date)' : 'DATE_TRUNC(\'month\', t.transaction_date)';
        $limit = ($period === 'day') ? 30 : 12;
        
        $query = "SELECT 
                    $groupBy as period,
                    SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) as income,
                    SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) as expense
                  FROM 
                    transactions t
                  WHERE 
                    t.project_id = ?
                  GROUP BY 
                    period
                  ORDER BY 
                    period DESC
                  LIMIT ?";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId, $limit]);
        
        $result = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $periodLabel = ($period === 'day') ? $row['period'] : date('Y-m', strtotime($row['period']));
            $income = floatval($row['income']);
            $expense = floatval($row['expense']);
            $netIncome = $income - $expense;
            
            $result[] = [
                'period' => $periodLabel,
                'income' => $income,
                'expense' => $expense,
                'netIncome' => $netIncome
            ];
        }
        
        // 反转结果，使其按照时间顺序排列
        return array_reverse($result);
    } catch (PDOException $e) {
        error_log("获取交易摘要错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 获取收入按科目分析数据
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param string $period 周期（month：本月，year：本年）
 * @return array 收入科目分析数据
 */
function getIncomeBySubject($db, $projectId, $period) {
    try {
        $dateCondition = ($period === 'month') 
            ? "DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)" 
            : "DATE_TRUNC('year', t.transaction_date) = DATE_TRUNC('year', CURRENT_DATE)";
        
        $query = "SELECT 
                    s.name as subject_name,
                    SUM(t.amount) as total_amount
                  FROM 
                    transactions t
                  JOIN 
                    subjects s ON t.subject_id = s.id
                  WHERE 
                    t.project_id = ? AND 
                    t.type = 'income' AND 
                    $dateCondition
                  GROUP BY 
                    s.name
                  ORDER BY 
                    total_amount DESC";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId]);
        
        $result = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $result[] = [
                'subject' => $row['subject_name'],
                'amount' => floatval($row['total_amount'])
            ];
        }
        
        return $result;
    } catch (PDOException $e) {
        error_log("获取收入科目分析错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 获取支出按科目分析数据
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param string $period 周期（month：本月，year：本年）
 * @return array 支出科目分析数据
 */
function getExpenseBySubject($db, $projectId, $period) {
    try {
        $dateCondition = ($period === 'month') 
            ? "DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)" 
            : "DATE_TRUNC('year', t.transaction_date) = DATE_TRUNC('year', CURRENT_DATE)";
        
        $query = "SELECT 
                    s.name as subject_name,
                    SUM(t.amount) as total_amount
                  FROM 
                    transactions t
                  JOIN 
                    subjects s ON t.subject_id = s.id
                  WHERE 
                    t.project_id = ? AND 
                    t.type = 'expense' AND 
                    $dateCondition
                  GROUP BY 
                    s.name
                  ORDER BY 
                    total_amount DESC";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId]);
        
        $result = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $result[] = [
                'subject' => $row['subject_name'],
                'amount' => floatval($row['total_amount'])
            ];
        }
        
        return $result;
    } catch (PDOException $e) {
        error_log("获取支出科目分析错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 获取支出按部门分析数据
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param string $period 周期（month：本月，year：本年）
 * @return array 部门支出分析数据
 */
function getExpenseByDepartment($db, $projectId, $period) {
    try {
        $dateCondition = ($period === 'month') 
            ? "DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)" 
            : "DATE_TRUNC('year', t.transaction_date) = DATE_TRUNC('year', CURRENT_DATE)";
        
        $query = "SELECT 
                    d.name as department_name,
                    SUM(t.amount) as total_amount
                  FROM 
                    transactions t
                  JOIN 
                    departments d ON t.department_id = d.id
                  WHERE 
                    t.project_id = ? AND 
                    t.type = 'expense' AND 
                    $dateCondition
                  GROUP BY 
                    d.name
                  ORDER BY 
                    total_amount DESC";
        
        $stmt = $db->prepare($query);
        $stmt->execute([$projectId]);
        
        $result = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $result[] = [
                'department' => $row['department_name'],
                'amount' => floatval($row['total_amount'])
            ];
        }
        
        return $result;
    } catch (PDOException $e) {
        error_log("获取部门支出分析错误: " . $e->getMessage());
        return [];
    }
}

/**
 * 获取综合仪表盘数据
 * 
 * @param PDO $db 数据库连接
 * @param int $projectId 项目ID
 * @param string $period 周期（month：本月，year：本年）
 * @return array 仪表盘综合数据
 */
function getDashboardData($db, $projectId, $period) {
    $accountSummary = getAccountSummary($db, $projectId);
    $transactionSummary = getTransactionSummary($db, $projectId, $period);
    $incomeBySubject = getIncomeBySubject($db, $projectId, $period);
    $expenseBySubject = getExpenseBySubject($db, $projectId, $period);
    $expenseByDepartment = getExpenseByDepartment($db, $projectId, $period);
    
    return [
        'accountSummary' => $accountSummary,
        'transactionSummary' => $transactionSummary,
        'incomeBySubject' => $incomeBySubject,
        'expenseBySubject' => $expenseBySubject,
        'expenseByDepartment' => $expenseByDepartment
    ];
}