<?php
/**
 * 初始化测试用户
 * 创建测试用户，用于系统测试和演示
 */
require_once __DIR__ . '/config/config.php';

// 获取数据库连接
$database = new Database();
$db = $database->getConnection();

// 检查是否已经有测试用户
$query = "SELECT COUNT(*) as count FROM users WHERE username = 'phpuser'";
$stmt = $db->prepare($query);
$stmt->execute();
$row = $stmt->fetch();

if ($row['count'] == 0) {
    try {
        // 开始事务
        $db->beginTransaction();

        // 设置测试用户数据
        $username = 'phpuser';
        $password = password_hash('123456', PASSWORD_DEFAULT);
        $fullName = 'PHP测试用户';
        $isSuperAdmin = true;
        $active = true;

        // 创建测试用户
        $query = "INSERT INTO users (username, password, full_name, is_super_admin, active) 
                  VALUES (?, ?, ?, ?, ?)";
        $stmt = $db->prepare($query);
        $stmt->execute([$username, $password, $fullName, $isSuperAdmin, $active]);
        $userId = $db->lastInsertId();

        // 检查是否已存在演示项目
        $query = "SELECT id FROM projects WHERE code = 'default'";
        $stmt = $db->prepare($query);
        $stmt->execute();
        
        if ($stmt->rowCount() == 0) {
            // 创建演示项目
            $query = "INSERT INTO projects (name, code, description, active) 
                      VALUES ('演示项目', 'default', '系统演示项目', true)";
            $stmt = $db->prepare($query);
            $stmt->execute();
            $projectId = $db->lastInsertId();
        } else {
            $row = $stmt->fetch();
            $projectId = $row['id'];
        }

        // 将用户关联到项目
        $query = "INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)";
        $stmt = $db->prepare($query);
        $stmt->execute([$userId, $projectId]);

        // 提交事务
        $db->commit();
        
        echo "测试用户创建成功 (username: phpuser, password: 123456)\n";
        echo "测试项目创建成功 (id: $projectId, name: 演示项目)\n";
        
    } catch (PDOException $e) {
        // 发生错误，回滚事务
        $db->rollBack();
        echo "测试用户创建失败：" . $e->getMessage() . "\n";
    }
} else {
    echo "测试用户已存在\n";
}