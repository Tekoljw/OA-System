<?php
/**
 * 用户模型
 */
class User {
    private $conn;
    private $table_name = "users";
    
    // 用户属性
    public $id;
    public $username;
    public $password;
    public $fullName;
    public $email;
    public $phone;
    public $department;
    public $role;
    public $notes;
    public $status;
    public $is_super_admin;
    public $project_id;
    public $active;
    public $created_at;
    public $updated_at;
    
    public function __construct($db) {
        $this->conn = $db;
    }
    
    /**
     * 创建新用户
     * 
     * @return bool 是否成功
     */
    public function create() {
        try {
            $query = "INSERT INTO " . $this->table_name . "
                     (username, password, fullName, email, phone, department, role, 
                      notes, status, is_super_admin, project_id, active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            
            $stmt = $this->conn->prepare($query);
            
            // 加密密码
            $this->password = password_hash($this->password, PASSWORD_DEFAULT);
            
            // 绑定参数
            $stmt->execute([
                $this->username, 
                $this->password, 
                $this->fullName, 
                $this->email,
                $this->phone, 
                $this->department, 
                $this->role, 
                $this->notes,
                $this->status, 
                $this->is_super_admin ? 1 : 0, 
                $this->project_id,
                $this->active ? 1 : 0
            ]);
            
            // 获取新创建的用户ID
            $this->id = $this->conn->lastInsertId();
            
            return true;
        } catch (PDOException $e) {
            error_log("创建用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取单个用户
     * 
     * @param int $id 用户ID
     * @return bool 是否成功
     */
    public function readOne($id) {
        try {
            $query = "SELECT * FROM " . $this->table_name . " WHERE id = ? LIMIT 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$id]);
            
            if ($stmt->rowCount() > 0) {
                $row = $stmt->fetch();
                
                // 设置属性
                $this->id = $row['id'];
                $this->username = $row['username'];
                $this->fullName = $row['fullName'] ?? '';
                $this->email = $row['email'] ?? '';
                $this->phone = $row['phone'] ?? '';
                $this->department = $row['department'] ?? '';
                $this->role = $row['role'] ?? '';
                $this->notes = $row['notes'] ?? '';
                $this->status = $row['status'] ?? '';
                $this->is_super_admin = (bool)($row['is_super_admin'] ?? false);
                $this->project_id = $row['project_id'] ?? null;
                $this->active = (bool)($row['active'] ?? true);
                $this->created_at = $row['created_at'];
                $this->updated_at = $row['updated_at'];
                
                return true;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("读取用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 更新用户
     * 
     * @return bool 是否成功
     */
    public function update() {
        try {
            $query = "UPDATE " . $this->table_name . "
                     SET username = ?, fullName = ?, email = ?, phone = ?,
                         department = ?, role = ?, notes = ?, status = ?,
                         is_super_admin = ?, project_id = ?, active = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->username, 
                $this->fullName, 
                $this->email,
                $this->phone, 
                $this->department, 
                $this->role, 
                $this->notes,
                $this->status, 
                $this->is_super_admin ? 1 : 0, 
                $this->project_id,
                $this->active ? 1 : 0,
                $this->id
            ]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("更新用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 更改密码
     * 
     * @param string $newPassword 新密码
     * @return bool 是否成功
     */
    public function changePassword($newPassword) {
        try {
            $query = "UPDATE " . $this->table_name . "
                     SET password = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?";
            
            $stmt = $this->conn->prepare($query);
            
            // 加密新密码
            $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
            
            // 绑定参数
            $stmt->execute([$hashedPassword, $this->id]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("更改密码错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 根据用户名获取用户
     * 
     * @param string $username 用户名
     * @return bool 是否成功
     */
    public function findByUsername($username) {
        try {
            $query = "SELECT * FROM " . $this->table_name . " WHERE username = ? LIMIT 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$username]);
            
            if ($stmt->rowCount() > 0) {
                $row = $stmt->fetch();
                
                // 设置属性
                $this->id = $row['id'];
                $this->username = $row['username'];
                $this->password = $row['password']; // 加密密码
                $this->fullName = $row['fullName'] ?? '';
                $this->email = $row['email'] ?? '';
                $this->phone = $row['phone'] ?? '';
                $this->department = $row['department'] ?? '';
                $this->role = $row['role'] ?? '';
                $this->notes = $row['notes'] ?? '';
                $this->status = $row['status'] ?? '';
                $this->is_super_admin = (bool)($row['is_super_admin'] ?? false);
                $this->project_id = $row['project_id'] ?? null;
                $this->active = (bool)($row['active'] ?? true);
                $this->created_at = $row['created_at'];
                $this->updated_at = $row['updated_at'];
                
                return true;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("通过用户名查找用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取用户列表
     * 
     * @param int $projectId 项目ID（可选）
     * @param int $limit 每页记录数
     * @param int $page 页码
     * @return array 用户列表
     */
    public function readAll($projectId = null, $limit = 10, $page = 1) {
        try {
            $offset = ($page - 1) * $limit;
            
            $whereClause = "";
            $params = [];
            
            if ($projectId !== null) {
                $whereClause = "WHERE project_id = ?";
                $params[] = $projectId;
            }
            
            $query = "SELECT * FROM " . $this->table_name . " 
                     " . $whereClause . "
                     ORDER BY id 
                     LIMIT ? OFFSET ?";
            
            $stmt = $this->conn->prepare($query);
            
            // 添加分页参数
            $params[] = $limit;
            $params[] = $offset;
            
            $stmt->execute($params);
            
            $users = [];
            while ($row = $stmt->fetch()) {
                // 移除敏感数据
                unset($row['password']);
                $users[] = $row;
            }
            
            return $users;
        } catch (PDOException $e) {
            error_log("读取用户列表错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 获取总记录数
     * 
     * @param int $projectId 项目ID（可选）
     * @return int 总记录数
     */
    public function count($projectId = null) {
        try {
            $whereClause = "";
            $params = [];
            
            if ($projectId !== null) {
                $whereClause = "WHERE project_id = ?";
                $params[] = $projectId;
            }
            
            $query = "SELECT COUNT(*) as total FROM " . $this->table_name . " " . $whereClause;
            $stmt = $this->conn->prepare($query);
            $stmt->execute($params);
            
            $row = $stmt->fetch();
            return (int)$row['total'];
        } catch (PDOException $e) {
            error_log("计算用户总数错误: " . $e->getMessage());
            return 0;
        }
    }
    
    /**
     * 添加用户到项目
     * 
     * @param int $projectId 项目ID
     * @return bool 是否成功
     */
    public function addToProject($projectId) {
        try {
            $query = "INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$this->id, $projectId]);
            
            return true;
        } catch (PDOException $e) {
            error_log("添加用户到项目错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 从项目中移除用户
     * 
     * @param int $projectId 项目ID
     * @return bool 是否成功
     */
    public function removeFromProject($projectId) {
        try {
            $query = "DELETE FROM user_projects WHERE user_id = ? AND project_id = ?";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$this->id, $projectId]);
            
            return true;
        } catch (PDOException $e) {
            error_log("从项目中移除用户错误: " . $e->getMessage());
            return false;
        }
    }
}