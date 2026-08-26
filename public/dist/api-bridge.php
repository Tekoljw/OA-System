<?php
/**
 * 用户数据API桥接 - 直接从数据库获取真实用户数据
 */

// 设置CORS和内容类型
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Origin, Content-Type, X-Auth-Token, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 数据库连接
$host = getenv('PGHOST') ?: 'localhost';
$dbname = getenv('PGDATABASE') ?: 'postgres';
$username = getenv('PGUSER') ?: 'postgres';
$password = getenv('PGPASSWORD') ?: 'postgres';
$port = getenv('PGPORT') ?: '5432';

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;user=$username;password=$password";
    $pdo = new PDO($dsn);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 获取所有真实用户数据
    $stmt = $pdo->prepare("
        SELECT 
            id,
            username,
            full_name as fullName,
            role,
            email,
            phone,
            active,
            project_id,
            created_at,
            updated_at
        FROM users 
        WHERE active = true 
        ORDER BY created_at DESC
    ");
    
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'users' => $users,
        'count' => count($users),
        'message' => '成功从PostgreSQL数据库获取真实用户数据'
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'message' => '数据库连接失败'
    ]);
}
?>