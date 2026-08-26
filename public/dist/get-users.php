<?php
// 用户数据获取端点
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 数据库连接
$host = getenv('PGHOST') ?: 'localhost';
$dbname = getenv('PGDATABASE') ?: 'postgres';
$username = getenv('PGUSER') ?: 'postgres';
$password = getenv('PGPASSWORD') ?: 'postgres';
$port = getenv('PGPORT') ?: '5432';

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $sql = "SELECT id, username, full_name as fullName, role, email, phone, active, project_id, created_at, updated_at FROM users WHERE active = true ORDER BY created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode(['success' => true, 'users' => $users, 'count' => count($users), 'message' => '成功获取用户数据']);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>