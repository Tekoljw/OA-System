<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include '../db_connection.php';

try {
    $conn = getDbConnection();
    
    // 获取项目ID
    $projectId = $_GET['projectId'] ?? 1;
    $fromDate = $_GET['fromDate'] ?? date('Y-m-01');
    $toDate = $_GET['toDate'] ?? date('Y-m-t');
    
    // 查询当月收入
    $incomeQuery = "
        SELECT COALESCE(SUM(amount), 0) as total_income 
        FROM transactions 
        WHERE project_id = :projectId 
        AND transaction_type = '收入' 
        AND transaction_date BETWEEN :fromDate AND :toDate
        AND transaction_status IN ('已审批', '已完成')
    ";
    
    $stmt = $conn->prepare($incomeQuery);
    $stmt->execute([
        'projectId' => $projectId,
        'fromDate' => $fromDate,
        'toDate' => $toDate
    ]);
    $currentIncome = $stmt->fetchColumn() ?: 0;
    
    // 查询当月支出
    $expenseQuery = "
        SELECT COALESCE(SUM(amount), 0) as total_expense 
        FROM transactions 
        WHERE project_id = :projectId 
        AND transaction_type = '支出' 
        AND transaction_date BETWEEN :fromDate AND :toDate
        AND transaction_status IN ('已审批', '已完成')
    ";
    
    $stmt = $conn->prepare($expenseQuery);
    $stmt->execute([
        'projectId' => $projectId,
        'fromDate' => $fromDate,
        'toDate' => $toDate
    ]);
    $currentExpense = $stmt->fetchColumn() ?: 0;
    
    // 计算上月数据
    $lastMonthStart = date('Y-m-01', strtotime('-1 month'));
    $lastMonthEnd = date('Y-m-t', strtotime('-1 month'));
    
    $stmt = $conn->prepare($incomeQuery);
    $stmt->execute([
        'projectId' => $projectId,
        'fromDate' => $lastMonthStart,
        'toDate' => $lastMonthEnd
    ]);
    $previousIncome = $stmt->fetchColumn() ?: 0;
    
    $stmt = $conn->prepare($expenseQuery);
    $stmt->execute([
        'projectId' => $projectId,
        'fromDate' => $lastMonthStart,
        'toDate' => $lastMonthEnd
    ]);
    $previousExpense = $stmt->fetchColumn() ?: 0;
    
    // 查询总资产
    $assetsQuery = "
        SELECT COALESCE(SUM(current_value), 0) as total_assets 
        FROM assets 
        WHERE project_id = :projectId 
        AND asset_status = '正常'
    ";
    
    $stmt = $conn->prepare($assetsQuery);
    $stmt->execute(['projectId' => $projectId]);
    $totalAssets = $stmt->fetchColumn() ?: 0;
    
    // 查询总收入和支出
    $totalIncomeQuery = "
        SELECT COALESCE(SUM(amount), 0) as total_income 
        FROM transactions 
        WHERE project_id = :projectId 
        AND transaction_type = '收入' 
        AND transaction_status IN ('已审批', '已完成')
    ";
    
    $stmt = $conn->prepare($totalIncomeQuery);
    $stmt->execute(['projectId' => $projectId]);
    $totalIncome = $stmt->fetchColumn() ?: 0;
    
    $totalExpenseQuery = "
        SELECT COALESCE(SUM(amount), 0) as total_expense 
        FROM transactions 
        WHERE project_id = :projectId 
        AND transaction_type = '支出' 
        AND transaction_status IN ('已审批', '已完成')
    ";
    
    $stmt = $conn->prepare($totalExpenseQuery);
    $stmt->execute(['projectId' => $projectId]);
    $totalExpense = $stmt->fetchColumn() ?: 0;
    
    // 构建响应数据
    $response = [
        'success' => true,
        'currentMonth' => [
            'income' => floatval($currentIncome),
            'expense' => floatval($currentExpense),
            'netFlow' => floatval($currentIncome - $currentExpense)
        ],
        'previousMonth' => [
            'income' => floatval($previousIncome),
            'expense' => floatval($previousExpense),
            'netFlow' => floatval($previousIncome - $previousExpense)
        ],
        'total' => [
            'income' => floatval($totalIncome),
            'expense' => floatval($totalExpense),
            'assets' => floatval($totalAssets)
        ],
        'mainCurrency' => 'CNY',
        'forexCurrency' => 'USD'
    ];
    
    echo json_encode($response);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'message' => '获取仪表盘数据失败'
    ]);
}
?>