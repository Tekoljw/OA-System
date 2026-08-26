<?php
// 创建用户端点
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
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
    
    // 获取POST数据
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        throw new Exception('无效的请求数据');
    }
    
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';
    $fullName = $input['fullName'] ?? '';
    $role = $input['role'] ?? 'user';
    $email = $input['email'] ?? '';
    $phone = $input['phone'] ?? '';
    $departmentId = isset($input['department']) ? (int)str_replace('dept-', '', $input['department']) : null;
    $projectId = $input['projectId'] ?? null;
    
    if (empty($username) || empty($password) || empty($fullName)) {
        throw new Exception('用户名、密码和姓名为必填项');
    }
    
    // 检查用户名是否已存在
    $checkSql = "SELECT COUNT(*) FROM users WHERE username = :username";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([':username' => $username]);
    
    if ($checkStmt->fetchColumn() > 0) {
        throw new Exception('用户名已存在');
    }
    
    // 密码加密（简单的hash，实际应用中建议使用更安全的方式）
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    // 插入新用户
    $sql = "INSERT INTO users (username, password, full_name, role, email, phone, department_id, project_id, active, created_at, updated_at) 
            VALUES (:username, :password, :fullName, :role, :email, :phone, :departmentId, :projectId, true, NOW(), NOW()) 
            RETURNING id, username, full_name as fullName, role, email, phone, active, created_at, updated_at";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':username' => $username,
        ':password' => $hashedPassword,
        ':fullName' => $fullName,
        ':role' => $role,
        ':email' => $email,
        ':phone' => $phone,
        ':departmentId' => $departmentId,
        ':projectId' => $projectId
    ]);
    
    $newUser = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true, 
        'user' => $newUser, 
        'message' => '用户创建成功'
    ]);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>