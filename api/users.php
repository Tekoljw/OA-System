<?php
/**
 * 遗留文件 — 已废弃，请使用 /api/users 端点（统一走 index.php 认证）
 */
header('Content-Type: application/json');
http_response_code(403);
echo json_encode(['success' => false, 'error' => '此端点已废弃，请使用 /api/users']);
exit();

// ===== 以下为旧代码，已禁用 =====
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 使用环境变量中的数据库连接信息
$databaseUrl = getenv('DATABASE_URL');
if (!$databaseUrl) {
    throw new Exception('DATABASE_URL environment variable not found');
}

try {
    $conn = new PDO($databaseUrl, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // 获取用户列表
        $projectId = $_GET['projectId'] ?? null;
        
        $sql = "SELECT id, username, full_name as fullName, role, email, phone, active, project_id, created_at, updated_at FROM users";
        $params = [];
        
        if ($projectId) {
            $sql .= " WHERE project_id = ?";
            $params[] = $projectId;
        }
        
        $sql .= " ORDER BY created_at DESC";
        
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // 转换active字段为布尔值
        foreach ($users as &$user) {
            $user['active'] = (bool)$user['active'];
        }
        
        echo json_encode([
            'success' => true,
            'users' => $users,
            'count' => count($users)
        ]);
        
    } else if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // 创建新用户
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input || !isset($input['username']) || !isset($input['fullName'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => '缺少必需的用户信息']);
            exit();
        }
        
        $sql = "INSERT INTO users (username, full_name, role, email, phone, active, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        
        $result = $stmt->execute([
            $input['username'],
            $input['fullName'],
            $input['role'] ?? 'user',
            $input['email'] ?? '',
            $input['phone'] ?? '',
            isset($input['active']) ? (bool)$input['active'] : true,
            $input['projectId'] ?? 1
        ]);
        
        if ($result) {
            $userId = $conn->lastInsertId();
            echo json_encode([
                'success' => true,
                'message' => '用户创建成功',
                'userId' => $userId
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => '用户创建失败']);
        }
        
    } else if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
        // 更新用户
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input || !isset($input['id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => '缺少用户ID']);
            exit();
        }
        
        $sql = "UPDATE users SET full_name = ?, role = ?, email = ?, phone = ?, active = ? WHERE id = ?";
        $stmt = $conn->prepare($sql);
        
        $result = $stmt->execute([
            $input['fullName'],
            $input['role'],
            $input['email'] ?? '',
            $input['phone'] ?? '',
            isset($input['active']) ? (bool)$input['active'] : true,
            $input['id']
        ]);
        
        if ($result) {
            echo json_encode(['success' => true, 'message' => '用户更新成功']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => '用户更新失败']);
        }
        
    } else if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        // 删除用户
        $userId = $_GET['id'] ?? null;
        
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => '缺少用户ID']);
            exit();
        }
        
        $sql = "DELETE FROM users WHERE id = ?";
        $stmt = $conn->prepare($sql);
        
        $result = $stmt->execute([$userId]);
        
        if ($result) {
            echo json_encode(['success' => true, 'message' => '用户删除成功']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => '用户删除失败']);
        }
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '数据库错误: ' . $e->getMessage()
    ]);
}
?>