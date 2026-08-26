<?php
/**
 * 项目模型
 */
class Project {
    private $conn;
    private $table_name = "projects";
    
    // 项目属性
    public $id;
    public $name;
    public $code;
    public $description;
    public $active;
    public $created_at;
    public $updated_at;
    public $created_by_id;
    
    public function __construct($db) {
        $this->conn = $db;
    }
    
    /**
     * 创建新项目
     * 
     * @return bool 是否成功
     */
    public function create() {
        try {
            $query = "INSERT INTO " . $this->table_name . "
                     (name, code, description, active, created_at, updated_at, created_by_id)
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->name,
                $this->code,
                $this->description,
                $this->active ? 1 : 0,
                $this->created_by_id
            ]);
            
            // 获取新创建的项目ID
            $this->id = $this->conn->lastInsertId();
            
            return true;
        } catch (PDOException $e) {
            error_log("创建项目错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取单个项目
     * 
     * @param int $id 项目ID
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
                $this->name = $row['name'];
                $this->code = $row['code'];
                $this->description = $row['description'] ?? '';
                $this->active = (bool)$row['active'];
                $this->created_at = $row['created_at'];
                $this->updated_at = $row['updated_at'];
                $this->created_by_id = $row['created_by_id'];
                
                return true;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("读取项目错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 更新项目
     * 
     * @return bool 是否成功
     */
    public function update() {
        try {
            $query = "UPDATE " . $this->table_name . "
                     SET name = ?, code = ?, description = ?, active = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->name,
                $this->code,
                $this->description,
                $this->active ? 1 : 0,
                $this->id
            ]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("更新项目错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取项目列表
     * 
     * @return array 项目列表
     */
    public function readAll() {
        try {
            $query = "SELECT * FROM " . $this->table_name . " ORDER BY id";
            $stmt = $this->conn->prepare($query);
            $stmt->execute();
            
            $projects = [];
            while ($row = $stmt->fetch()) {
                $projects[] = $row;
            }
            
            return $projects;
        } catch (PDOException $e) {
            error_log("读取项目列表错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 获取活跃项目列表
     * 
     * @return array 活跃项目列表
     */
    public function readActive() {
        try {
            $query = "SELECT * FROM " . $this->table_name . " WHERE active = 1 ORDER BY id";
            $stmt = $this->conn->prepare($query);
            $stmt->execute();
            
            $projects = [];
            while ($row = $stmt->fetch()) {
                $projects[] = $row;
            }
            
            return $projects;
        } catch (PDOException $e) {
            error_log("读取活跃项目列表错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 检查项目是否存在且活跃
     * 
     * @param int $id 项目ID
     * @return bool 是否存在且活跃
     */
    public function isActiveProject($id) {
        try {
            $query = "SELECT id FROM " . $this->table_name . " WHERE id = ? AND active = 1 LIMIT 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$id]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("检查项目是否活跃错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 为项目添加用户
     * 
     * @param int $userId 用户ID
     * @return bool 是否成功
     */
    public function addUser($userId) {
        try {
            $query = "INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$userId, $this->id]);
            
            return true;
        } catch (PDOException $e) {
            // 如果是唯一性约束违反，说明记录已经存在，也视为成功
            if (strpos($e->getMessage(), 'unique constraint') !== false) {
                return true;
            }
            error_log("为项目添加用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 从项目中移除用户
     * 
     * @param int $userId 用户ID
     * @return bool 是否成功
     */
    public function removeUser($userId) {
        try {
            $query = "DELETE FROM user_projects WHERE user_id = ? AND project_id = ?";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$userId, $this->id]);
            
            return true;
        } catch (PDOException $e) {
            error_log("从项目中移除用户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取项目的用户列表
     * 
     * @return array 用户列表
     */
    public function getUsers() {
        try {
            $query = "SELECT u.* FROM users u 
                      JOIN user_projects up ON u.id = up.user_id 
                      WHERE up.project_id = ? AND u.active = 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$this->id]);
            
            $users = [];
            while ($row = $stmt->fetch()) {
                // 移除敏感数据
                unset($row['password']);
                $users[] = $row;
            }
            
            return $users;
        } catch (PDOException $e) {
            error_log("获取项目用户错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 初始化项目基础配置
     * 创建所需的币种、账户类型、资产类型和科目
     * 
     * @return bool 是否成功
     */
    public function initializeConfig() {
        // 获取数据库连接
        $db = $this->conn;
        
        try {
            // 开始事务
            $db->beginTransaction();
            
            // 1. 初始化币种
            $currencies = [
                ['name' => '人民币', 'code' => 'CNY', 'description' => '中国法定货币'],
                ['name' => '美元', 'code' => 'USD', 'description' => '美国法定货币'],
                ['name' => '欧元', 'code' => 'EUR', 'description' => '欧盟法定货币'],
                ['name' => '日元', 'code' => 'JPY', 'description' => '日本法定货币'],
                ['name' => '英镑', 'code' => 'GBP', 'description' => '英国法定货币'],
                ['name' => '港币', 'code' => 'HKD', 'description' => '香港特别行政区法定货币']
            ];
            
            $currencyQuery = "INSERT INTO currency_types (name, code, description, project_id, created_at, updated_at) 
                             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            $currencyStmt = $db->prepare($currencyQuery);
            
            foreach ($currencies as $currency) {
                $currencyStmt->execute([
                    $currency['name'],
                    $currency['code'],
                    $currency['description'],
                    $this->id
                ]);
            }
            
            // 2. 初始化账户类型
            $accountTypes = [
                ['name' => '现金账户', 'description' => '现金和实物资产账户'],
                ['name' => '银行账户', 'description' => '银行存款账户'],
                ['name' => '信用卡', 'description' => '信用卡账户'],
                ['name' => '投资账户', 'description' => '投资和理财账户'],
                ['name' => '应收账款', 'description' => '应收款项账户'],
                ['name' => '应付账款', 'description' => '应付款项账户']
            ];
            
            $accountTypeQuery = "INSERT INTO account_types (name, description, project_id, created_at, updated_at) 
                               VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            $accountTypeStmt = $db->prepare($accountTypeQuery);
            
            foreach ($accountTypes as $accountType) {
                $accountTypeStmt->execute([
                    $accountType['name'],
                    $accountType['description'],
                    $this->id
                ]);
            }
            
            // 3. 初始化资产类型
            $assetTypes = [
                ['name' => '流动资产', 'description' => '可快速变现的资产'],
                ['name' => '固定资产', 'description' => '长期使用的有形资产'],
                ['name' => '金融资产', 'description' => '债券、股票等金融工具'],
                ['name' => '无形资产', 'description' => '专利、商标等无形资产']
            ];
            
            $assetTypeQuery = "INSERT INTO asset_types (name, description, project_id, created_at, updated_at) 
                             VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            $assetTypeStmt = $db->prepare($assetTypeQuery);
            
            foreach ($assetTypes as $assetType) {
                $assetTypeStmt->execute([
                    $assetType['name'],
                    $assetType['description'],
                    $this->id
                ]);
            }
            
            // 4. 初始化科目
            $subjects = [
                ['name' => '办公经费', 'description' => '办公用品和日常开支'],
                ['name' => '交通费用', 'description' => '交通和差旅费用'],
                ['name' => '销售收入', 'description' => '产品和服务销售收入'],
                ['name' => '工资支出', 'description' => '员工工资和福利'],
                ['name' => '其他收入', 'description' => '其他类型收入'],
                ['name' => '其他支出', 'description' => '其他类型支出']
            ];
            
            $subjectQuery = "INSERT INTO subjects (name, description, project_id, created_at, updated_at) 
                           VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            $subjectStmt = $db->prepare($subjectQuery);
            
            foreach ($subjects as $subject) {
                $subjectStmt->execute([
                    $subject['name'],
                    $subject['description'],
                    $this->id
                ]);
            }
            
            // 提交事务
            $db->commit();
            
            return true;
        } catch (PDOException $e) {
            // 回滚事务
            $db->rollBack();
            error_log("初始化项目配置错误: " . $e->getMessage());
            return false;
        }
    }
}