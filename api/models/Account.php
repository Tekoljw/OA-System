<?php
/**
 * 账户模型
 */
class Account {
    private $conn;
    private $table_name = "accounts";
    
    // 账户属性
    public $id;
    public $name;
    public $bank;
    public $account_number;
    public $balance;
    public $currency_type;
    public $account_type;
    public $credit_limit;
    public $verification_status;
    public $owner;
    public $notes;
    public $project_id;
    public $active;
    public $created_at;
    public $updated_at;
    
    public function __construct($db) {
        $this->conn = $db;
    }
    
    /**
     * 创建新账户
     * 
     * @return bool 是否成功
     */
    public function create() {
        try {
            $query = "INSERT INTO " . $this->table_name . "
                     (name, bank, account_number, balance, currency_type, account_type, 
                      credit_limit, verification_status, owner, notes, project_id, active,
                      created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->name,
                $this->bank,
                $this->account_number,
                $this->balance,
                $this->currency_type,
                $this->account_type,
                $this->credit_limit,
                $this->verification_status,
                $this->owner,
                $this->notes,
                $this->project_id,
                $this->active ? 1 : 0
            ]);
            
            // 获取新创建的账户ID
            $this->id = $this->conn->lastInsertId();
            
            return true;
        } catch (PDOException $e) {
            error_log("创建账户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取单个账户
     * 
     * @param int $id 账户ID
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
                $this->bank = $row['bank'] ?? '';
                $this->account_number = $row['account_number'] ?? '';
                $this->balance = $row['balance'] ?? 0;
                $this->currency_type = $row['currency_type'] ?? '';
                $this->account_type = $row['account_type'] ?? '';
                $this->credit_limit = $row['credit_limit'] ?? 0;
                $this->verification_status = $row['verification_status'] ?? '';
                $this->owner = $row['owner'] ?? '';
                $this->notes = $row['notes'] ?? '';
                $this->project_id = $row['project_id'];
                $this->active = (bool)$row['active'];
                $this->created_at = $row['created_at'];
                $this->updated_at = $row['updated_at'];
                
                return true;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("读取账户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 更新账户
     * 
     * @return bool 是否成功
     */
    public function update() {
        try {
            $query = "UPDATE " . $this->table_name . "
                     SET name = ?, bank = ?, account_number = ?, balance = ?,
                         currency_type = ?, account_type = ?, credit_limit = ?,
                         verification_status = ?, owner = ?, notes = ?,
                         active = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND project_id = ?";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->name,
                $this->bank,
                $this->account_number,
                $this->balance,
                $this->currency_type,
                $this->account_type,
                $this->credit_limit,
                $this->verification_status,
                $this->owner,
                $this->notes,
                $this->active ? 1 : 0,
                $this->id,
                $this->project_id
            ]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("更新账户错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 更新账户余额
     * 
     * @param float $amount 变动金额
     * @param bool $isIncrease 是否增加
     * @return bool 是否成功
     */
    public function updateBalance($amount, $isIncrease = true) {
        try {
            // 读取当前账户确保余额是最新的
            if (!$this->readOne($this->id)) {
                return false;
            }
            
            // 计算新余额
            $newBalance = $isIncrease 
                ? $this->balance + $amount 
                : $this->balance - $amount;
            
            $query = "UPDATE " . $this->table_name . "
                     SET balance = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND project_id = ?";
            
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$newBalance, $this->id, $this->project_id]);
            
            if ($stmt->rowCount() > 0) {
                $this->balance = $newBalance;
                return true;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("更新账户余额错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取账户列表
     * 
     * @param int $projectId 项目ID
     * @param int $limit 每页记录数
     * @param int $page 页码
     * @return array 账户列表
     */
    public function readAll($projectId, $limit = 10, $page = 1) {
        try {
            $offset = ($page - 1) * $limit;
            
            $query = "SELECT * FROM " . $this->table_name . " 
                     WHERE project_id = ? 
                     ORDER BY id 
                     LIMIT ? OFFSET ?";
            
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$projectId, $limit, $offset]);
            
            $accounts = [];
            while ($row = $stmt->fetch()) {
                $accounts[] = $row;
            }
            
            return $accounts;
        } catch (PDOException $e) {
            error_log("读取账户列表错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 获取账户总数
     * 
     * @param int $projectId 项目ID
     * @return int 账户总数
     */
    public function count($projectId) {
        try {
            $query = "SELECT COUNT(*) as total FROM " . $this->table_name . " WHERE project_id = ?";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$projectId]);
            
            $row = $stmt->fetch();
            return (int)$row['total'];
        } catch (PDOException $e) {
            error_log("获取账户总数错误: " . $e->getMessage());
            return 0;
        }
    }
    
    /**
     * 获取账户摘要数据
     * 
     * @param int $projectId 项目ID
     * @return array 账户摘要数据
     */
    public function getSummary($projectId) {
        try {
            // 初始化摘要数据
            $summary = [
                'totalAssets' => 0,
                'totalLiabilities' => 0,
                'netWorth' => 0,
                'cashAccounts' => 0,
                'bankAccounts' => 0,
                'creditCards' => 0,
                'investmentAccounts' => 0,
                'receivableAccounts' => 0,
                'payableAccounts' => 0,
                'byCurrency' => []
            ];
            
            // 获取所有账户
            $query = "SELECT * FROM " . $this->table_name . " WHERE project_id = ? AND active = 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$projectId]);
            
            while ($account = $stmt->fetch()) {
                $balance = (float)$account['balance'];
                
                // 根据账户类型累加金额
                switch ($account['account_type']) {
                    case '现金账户':
                        $summary['cashAccounts'] += $balance;
                        $summary['totalAssets'] += $balance;
                        break;
                    case '银行账户':
                        $summary['bankAccounts'] += $balance;
                        $summary['totalAssets'] += $balance;
                        break;
                    case '信用卡':
                        // 信用卡余额通常为负值，表示负债
                        $summary['creditCards'] += $balance;
                        if ($balance < 0) {
                            $summary['totalLiabilities'] += abs($balance);
                        } else {
                            $summary['totalAssets'] += $balance;
                        }
                        break;
                    case '投资账户':
                        $summary['investmentAccounts'] += $balance;
                        $summary['totalAssets'] += $balance;
                        break;
                    case '应收账款':
                        $summary['receivableAccounts'] += $balance;
                        $summary['totalAssets'] += $balance;
                        break;
                    case '应付账款':
                        // 应付账款通常为负值，表示负债
                        $summary['payableAccounts'] += $balance;
                        if ($balance < 0) {
                            $summary['totalLiabilities'] += abs($balance);
                        } else {
                            $summary['totalAssets'] += $balance;
                        }
                        break;
                    default:
                        // 其他类型账户
                        if ($balance >= 0) {
                            $summary['totalAssets'] += $balance;
                        } else {
                            $summary['totalLiabilities'] += abs($balance);
                        }
                }
                
                // 按币种累加
                $currency = $account['currency_type'];
                if (!isset($summary['byCurrency'][$currency])) {
                    $summary['byCurrency'][$currency] = [
                        'totalAssets' => 0,
                        'totalLiabilities' => 0,
                        'netWorth' => 0
                    ];
                }
                
                if ($balance >= 0) {
                    $summary['byCurrency'][$currency]['totalAssets'] += $balance;
                } else {
                    $summary['byCurrency'][$currency]['totalLiabilities'] += abs($balance);
                }
                
                $summary['byCurrency'][$currency]['netWorth'] = 
                    $summary['byCurrency'][$currency]['totalAssets'] - 
                    $summary['byCurrency'][$currency]['totalLiabilities'];
            }
            
            // 计算净资产
            $summary['netWorth'] = $summary['totalAssets'] - $summary['totalLiabilities'];
            
            return $summary;
        } catch (PDOException $e) {
            error_log("获取账户摘要错误: " . $e->getMessage());
            return [
                'totalAssets' => 0,
                'totalLiabilities' => 0,
                'netWorth' => 0,
                'byCurrency' => []
            ];
        }
    }
}