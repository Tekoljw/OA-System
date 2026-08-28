<?php
/**
 * 身份验证处理类
 */
class Auth {
    private $conn;
    
    public function __construct($db) {
        $this->conn = $db;
    }
    
    /**
     * 验证用户凭据
     * 
     * @param string $username 用户名
     * @param string $password 密码
     * @return array|bool 用户数据或false
     */
    public function login($username, $password) {
        try {
            $query = "SELECT * FROM users WHERE username = ? AND active = true LIMIT 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$username]);
            
            if ($stmt->rowCount() > 0) {
                $user = $stmt->fetch();
                
                // 验证密码
                if (password_verify($password, $user['password'])) {
                    // 移除敏感数据
                    unset($user['password']);
                    
                    // 生成JWT令牌
                    $user['token'] = $this->generateToken($user);
                    
                    // 获取用户的项目
                    $user['projectsList'] = $this->getUserProjects($user['id']);
                    
                    // 设置当前项目
                    if (!empty($user['projectsList'])) {
                        $defaultProject = $user['projectsList'][0];
                        $user['currentProject'] = $defaultProject;
                        $user['projectId'] = $defaultProject['id'];
                    }
                    
                    return $user;
                }
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("登录错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 生成JWT令牌
     * 
     * @param array $user 用户数据
     * @return string JWT令牌
     */
    private function generateToken($user) {
        // 简单实现，实际应用应使用JWT库
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode([
            'sub' => $user['id'],
            'name' => $user['username'],
            'iat' => time(),
            'exp' => time() + (60 * 60 * 24) // 24小时过期
        ]);
        
        $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
        $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
        
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, getenv('JWT_SECRET') ?: (function(){ throw new \RuntimeException('JWT_SECRET 环境变量未设置'); })(), true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
        
        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }
    
    /**
     * 验证JWT令牌
     * 
     * @param string $token JWT令牌
     * @return bool|array 成功返回用户ID，失败返回false
     */
    public function validateToken($token) {
        if (empty($token)) {
            return false;
        }
        
        $parts = explode('.', $token);
        if (count($parts) != 3) {
            return false;
        }
        
        list($base64UrlHeader, $base64UrlPayload, $base64UrlSignature) = $parts;
        
        $signature = base64_decode(str_replace(['-', '_'], ['+', '/'], $base64UrlSignature));
        $expectedSignature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, getenv('JWT_SECRET') ?: (function(){ throw new \RuntimeException('JWT_SECRET 环境变量未设置'); })(), true);
        
        if (!hash_equals($signature, $expectedSignature)) {
            return false;
        }
        
        $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $base64UrlPayload)), true);
        
        // 检查令牌是否过期
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return false;
        }
        
        return $payload;
    }
    
    /**
     * 获取用户的项目列表
     * 
     * @param int $userId 用户ID
     * @return array 项目列表
     */
    public function getUserProjects($userId) {
        try {
            // 如果是超级管理员，获取所有项目
            $isSuperAdmin = $this->isSuperAdmin($userId);
            
            if ($isSuperAdmin) {
                $query = "SELECT * FROM projects WHERE active = true ORDER BY id";
                $stmt = $this->conn->prepare($query);
                $stmt->execute();
            } else {
                // 获取用户关联的项目
                $query = "SELECT p.* FROM projects p 
                          JOIN user_projects up ON p.id = up.project_id 
                          WHERE up.user_id = ? AND p.active = true 
                          ORDER BY p.id";
                $stmt = $this->conn->prepare($query);
                $stmt->execute([$userId]);
            }
            
            $projects = [];
            while ($row = $stmt->fetch()) {
                $projects[] = $row;
            }
            
            return $projects;
        } catch (PDOException $e) {
            error_log("获取用户项目错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 检查用户是否为超级管理员
     * 
     * @param int $userId 用户ID
     * @return bool 是否为超级管理员
     */
    public function isSuperAdmin($userId) {
        try {
            $query = "SELECT is_super_admin FROM users WHERE id = ?";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$userId]);
            
            if ($stmt->rowCount() > 0) {
                $row = $stmt->fetch();
                return (bool)$row['is_super_admin'];
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("检查超级管理员错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取当前验证用户
     * 
     * @return array|bool 用户数据或false
     */
    public function getCurrentUser() {
        $headers = getallheaders();
        $token = null;
        
        // 从请求头获取令牌
        if (isset($headers['Authorization'])) {
            $authHeader = $headers['Authorization'];
            if (strpos($authHeader, 'Bearer ') === 0) {
                $token = substr($authHeader, 7);
            }
        }
        
        if (!$token) {
            return false;
        }
        
        $payload = $this->validateToken($token);
        if (!$payload || !isset($payload['sub'])) {
            return false;
        }
        
        try {
            $query = "SELECT * FROM users WHERE id = ? AND active = true LIMIT 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$payload['sub']]);
            
            if ($stmt->rowCount() > 0) {
                $user = $stmt->fetch();
                
                // 移除敏感数据
                unset($user['password']);
                
                // 获取用户的项目
                $user['projectsList'] = $this->getUserProjects($user['id']);
                
                // 再次检查当前项目
                $projectId = $_GET['projectId'] ?? null;
                if ($projectId) {
                    foreach ($user['projectsList'] as $project) {
                        if ($project['id'] == $projectId) {
                            $user['currentProject'] = $project;
                            $user['projectId'] = $project['id'];
                            break;
                        }
                    }
                } else if (!empty($user['projectsList'])) {
                    $user['currentProject'] = $user['projectsList'][0];
                    $user['projectId'] = $user['projectsList'][0]['id'];
                }
                
                return $user;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("获取当前用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 检查用户是否有访问特定项目的权限
     * 
     * @param int $userId 用户ID
     * @param int $projectId 项目ID
     * @return bool 是否有权限
     */
    public function hasProjectAccess($userId, $projectId) {
        // 超级管理员有所有项目的访问权限
        if ($this->isSuperAdmin($userId)) {
            return true;
        }
        
        try {
            $query = "SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$userId, $projectId]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("检查项目访问权限错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 切换项目
     *
     * @param int $userId 用户ID
     * @param int $projectId 项目ID
     * @return array|bool 项目信息或false
     */
    public function switchProject($userId, $projectId) {
        if (!$this->hasProjectAccess($userId, $projectId)) {
            return false;
        }

        try {
            $query = "SELECT * FROM projects WHERE id = ? AND active = true";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$projectId]);

            if ($stmt->rowCount() > 0) {
                return $stmt->fetch();
            }

            return false;
        } catch (PDOException $e) {
            error_log("切换项目错误: " . $e->getMessage());
            return false;
        }
    }
}

/**
 * 独立函数：生成 JWT 令牌（供 Service 层调用）
 */
function generateToken(array $user): string {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'sub' => $user['id'],
        'name' => $user['username'] ?? '',
        'role' => $user['role'] ?? '',
        'iat' => time(),
        'exp' => time() + (60 * 60 * 24)
    ]);

    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));

    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, getenv('JWT_SECRET') ?: (function(){ throw new \RuntimeException('JWT_SECRET 环境变量未设置'); })(), true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

/**
 * 独立函数：验证 JWT 令牌（供 Middleware 层调用）
 */
function validateToken(string $token): array|false {
    if (empty($token)) {
        return false;
    }

    $parts = explode('.', $token);
    if (count($parts) != 3) {
        return false;
    }

    [$base64UrlHeader, $base64UrlPayload, $base64UrlSignature] = $parts;

    $signature = base64_decode(str_replace(['-', '_'], ['+', '/'], $base64UrlSignature));
    $expectedSignature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, getenv('JWT_SECRET') ?: (function(){ throw new \RuntimeException('JWT_SECRET 环境变量未设置'); })(), true);

    if (!hash_equals($signature, $expectedSignature)) {
        return false;
    }

    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $base64UrlPayload)), true);

    if (isset($payload['exp']) && $payload['exp'] < time()) {
        return false;
    }

    return $payload;
}