<?php
/**
 * 从数据库获取真实资产数据
 * 直接返回数据，不进行其他处理
 */

// 设置错误报告
ini_set('display_errors', 0);
error_reporting(0);

// 设置内容类型
header('Content-Type: application/json; charset=utf-8');

// 允许跨域请求
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 如果是预检请求，直接返回
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    // 从环境变量获取数据库连接信息
    $db_host = getenv('PGHOST');
    $db_port = getenv('PGPORT');
    $db_name = getenv('PGDATABASE');
    $db_user = getenv('PGUSER');
    $db_password = getenv('PGPASSWORD');
    
    // 创建数据库连接
    $conn = pg_connect("host={$db_host} port={$db_port} dbname={$db_name} user={$db_user} password={$db_password}");
    
    if (!$conn) {
        throw new Exception("无法连接到数据库");
    }
    
    // 简化的查询，只获取必要字段
    $query = "SELECT * FROM assets ORDER BY created_at DESC";
    $result = pg_query($conn, $query);
    
    if (!$result) {
        throw new Exception("查询失败: " . pg_last_error($conn));
    }
    
    $assets = [];
    while ($row = pg_fetch_assoc($result)) {
        $assets[] = $row;
    }
    
    // 构造响应
    $response = [
        'success' => true,
        'data' => [
            'assets' => $assets,
            'total' => count($assets)
        ]
    ];
    
    echo json_encode($response);
    
} catch (Exception $e) {
    $response = [
        'success' => false,
        'error' => $e->getMessage()
    ];
    echo json_encode($response);
} finally {
    if (isset($conn)) {
        pg_close($conn);
    }
}
?>