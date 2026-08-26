<?php
/**
 * 用户数据代理 - 直接连接PostgreSQL获取真实用户数据
 */

// 设置CORS头
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 数据库连接配置
$host = getenv('PGHOST') ?: 'localhost';
$dbname = getenv('PGDATABASE') ?: 'postgres';
$username = getenv('PGUSER') ?: 'postgres';
$password = getenv('PGPASSWORD') ?: 'postgres';
$port = getenv('PGPORT') ?: '5432';

try {
    // 连接PostgreSQL数据库
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // 查询所有活跃用户
    $sql = "SELECT 
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
    ORDER BY created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // 返回成功响应
    echo json_encode([
        'success' => true,
        'users' => $users,
        'count' => count($users),
        'message' => '成功从PostgreSQL数据库获取用户数据'
    ]);
    
} catch (Exception $e) {
    // 返回错误响应
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'message' => '数据库连接失败'
    ]);
}
?>