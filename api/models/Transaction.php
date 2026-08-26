<?php
/**
 * 交易模型
 */
class Transaction {
    private $conn;
    private $table_name = "transactions";
    
    // 交易属性
    public $id;
    public $transaction_date;
    public $amount;
    public $currency;
    public $description;
    public $transaction_type; // income, expense, transfer
    public $category;
    public $subject_id;
    public $department_id;
    public $account_id;
    public $target_account_id; // For transfers
    public $user_id;
    public $project_id;
    public $reference_number;
    public $status;
    public $created_at;
    public $updated_at;
    
    public function __construct($db) {
        $this->conn = $db;
    }
    
    /**
     * 创建新交易
     * 
     * @return bool 是否成功
     */
    public function create() {
        try {
            // 开始事务
            $this->conn->beginTransaction();
            
            $query = "INSERT INTO " . $this->table_name . "
                     (transaction_date, amount, currency, description, transaction_type,
                      category, subject_id, department_id, account_id, target_account_id,
                      user_id, project_id, reference_number, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->transaction_date,
                $this->amount,
                $this->currency,
                $this->description,
                $this->transaction_type,
                $this->category,
                $this->subject_id,
                $this->department_id,
                $this->account_id,
                $this->target_account_id,
                $this->user_id,
                $this->project_id,
                $this->reference_number,
                $this->status
            ]);
            
            // 获取新创建的交易ID
            $this->id = $this->conn->lastInsertId();
            
            // 如果交易类型是收入或支出，更新账户余额
            if ($this->transaction_type === 'income' || $this->transaction_type === 'expense') {
                $account = new Account($this->conn);
                $account->id = $this->account_id;
                $account->project_id = $this->project_id;
                
                $isIncrease = $this->transaction_type === 'income';
                if (!$account->updateBalance($this->amount, $isIncrease)) {
                    // 更新账户余额失败，回滚事务
                    $this->conn->rollBack();
                    return false;
                }
            }
            // 如果交易类型是转账，更新两个账户的余额
            else if ($this->transaction_type === 'transfer' && $this->target_account_id) {
                // 源账户减少余额
                $sourceAccount = new Account($this->conn);
                $sourceAccount->id = $this->account_id;
                $sourceAccount->project_id = $this->project_id;
                
                if (!$sourceAccount->updateBalance($this->amount, false)) {
                    // 更新源账户余额失败，回滚事务
                    $this->conn->rollBack();
                    return false;
                }
                
                // 目标账户增加余额
                $targetAccount = new Account($this->conn);
                $targetAccount->id = $this->target_account_id;
                $targetAccount->project_id = $this->project_id;
                
                if (!$targetAccount->updateBalance($this->amount, true)) {
                    // 更新目标账户余额失败，回滚事务
                    $this->conn->rollBack();
                    return false;
                }
            }
            
            // 提交事务
            $this->conn->commit();
            
            return true;
        } catch (PDOException $e) {
            // 回滚事务
            $this->conn->rollBack();
            error_log("创建交易错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取单个交易
     * 
     * @param int $id 交易ID
     * @return bool 是否成功
     */
    public function readOne($id) {
        try {
            $query = "SELECT t.*, 
                      a.name as account_name, 
                      ta.name as target_account_name,
                      s.name as subject_name,
                      d.name as department_name
                      FROM " . $this->table_name . " t
                      LEFT JOIN accounts a ON t.account_id = a.id
                      LEFT JOIN accounts ta ON t.target_account_id = ta.id
                      LEFT JOIN subjects s ON t.subject_id = s.id
                      LEFT JOIN departments d ON t.department_id = d.id
                      WHERE t.id = ? LIMIT 1";
                      
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$id]);
            
            if ($stmt->rowCount() > 0) {
                $row = $stmt->fetch();
                
                // 设置属性
                $this->id = $row['id'];
                $this->transaction_date = $row['transaction_date'];
                $this->amount = $row['amount'];
                $this->currency = $row['currency'];
                $this->description = $row['description'];
                $this->transaction_type = $row['transaction_type'];
                $this->category = $row['category'];
                $this->subject_id = $row['subject_id'];
                $this->department_id = $row['department_id'];
                $this->account_id = $row['account_id'];
                $this->target_account_id = $row['target_account_id'];
                $this->user_id = $row['user_id'];
                $this->project_id = $row['project_id'];
                $this->reference_number = $row['reference_number'];
                $this->status = $row['status'];
                $this->created_at = $row['created_at'];
                $this->updated_at = $row['updated_at'];
                
                // 附加信息
                $row['account_name'] = $row['account_name'] ?? '';
                $row['target_account_name'] = $row['target_account_name'] ?? '';
                $row['subject_name'] = $row['subject_name'] ?? '';
                $row['department_name'] = $row['department_name'] ?? '';
                
                return $row;
            }
            
            return false;
        } catch (PDOException $e) {
            error_log("读取交易错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 更新交易
     * 注意：一旦交易创建，为了保持账务完整性，不允许修改金额和账户
     * 
     * @return bool 是否成功
     */
    public function update() {
        try {
            $query = "UPDATE " . $this->table_name . "
                     SET transaction_date = ?, description = ?, category = ?,
                         subject_id = ?, department_id = ?, reference_number = ?,
                         status = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND project_id = ?";
            
            $stmt = $this->conn->prepare($query);
            
            // 绑定参数
            $stmt->execute([
                $this->transaction_date,
                $this->description,
                $this->category,
                $this->subject_id,
                $this->department_id,
                $this->reference_number,
                $this->status,
                $this->id,
                $this->project_id
            ]);
            
            return $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("更新交易错误: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * 获取交易列表
     * 
     * @param int $projectId 项目ID
     * @param string $currency 币种（可选）
     * @param string $startDate 开始日期（可选）
     * @param string $endDate 结束日期（可选）
     * @param string $type 交易类型（可选）
     * @param int $accountId 账户ID（可选）
     * @param int $subjectId 科目ID（可选）
     * @param int $departmentId 部门ID（可选）
     * @param int $limit 每页记录数
     * @param int $page 页码
     * @return array 交易列表
     */
    public function readAll($projectId, $params = []) {
        try {
            $conditions = ["t.project_id = ?"];
            $parameters = [$projectId];
            
            // 处理筛选条件
            if (!empty($params['currency'])) {
                $conditions[] = "t.currency = ?";
                $parameters[] = $params['currency'];
            }
            
            if (!empty($params['startDate'])) {
                $conditions[] = "t.transaction_date >= ?";
                $parameters[] = $params['startDate'];
            }
            
            if (!empty($params['endDate'])) {
                $conditions[] = "t.transaction_date <= ?";
                $parameters[] = $params['endDate'];
            }
            
            if (!empty($params['type'])) {
                $conditions[] = "t.transaction_type = ?";
                $parameters[] = $params['type'];
            }
            
            if (!empty($params['accountId'])) {
                $conditions[] = "(t.account_id = ? OR t.target_account_id = ?)";
                $parameters[] = $params['accountId'];
                $parameters[] = $params['accountId'];
            }
            
            if (!empty($params['subjectId'])) {
                $conditions[] = "t.subject_id = ?";
                $parameters[] = $params['subjectId'];
            }
            
            if (!empty($params['departmentId'])) {
                $conditions[] = "t.department_id = ?";
                $parameters[] = $params['departmentId'];
            }
            
            // 构建WHERE子句
            $whereClause = implode(" AND ", $conditions);
            
            // 分页参数
            $limit = isset($params['limit']) ? (int)$params['limit'] : 10;
            $page = isset($params['page']) ? (int)$params['page'] : 1;
            $offset = ($page - 1) * $limit;
            
            // 添加分页参数
            $parameters[] = $limit;
            $parameters[] = $offset;
            
            $query = "SELECT t.*, 
                      a.name as account_name, 
                      ta.name as target_account_name,
                      s.name as subject_name,
                      d.name as department_name,
                      u.username as username
                      FROM " . $this->table_name . " t
                      LEFT JOIN accounts a ON t.account_id = a.id
                      LEFT JOIN accounts ta ON t.target_account_id = ta.id
                      LEFT JOIN subjects s ON t.subject_id = s.id
                      LEFT JOIN departments d ON t.department_id = d.id
                      LEFT JOIN users u ON t.user_id = u.id
                      WHERE " . $whereClause . "
                      ORDER BY t.transaction_date DESC, t.id DESC
                      LIMIT ? OFFSET ?";
            
            $stmt = $this->conn->prepare($query);
            $stmt->execute($parameters);
            
            $transactions = [];
            while ($row = $stmt->fetch()) {
                $transactions[] = $row;
            }
            
            return $transactions;
        } catch (PDOException $e) {
            error_log("读取交易列表错误: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * 获取交易总数
     * 
     * @param int $projectId 项目ID
     * @param array $params 筛选参数
     * @return int 交易总数
     */
    public function count($projectId, $params = []) {
        try {
            $conditions = ["project_id = ?"];
            $parameters = [$projectId];
            
            // 处理筛选条件
            if (!empty($params['currency'])) {
                $conditions[] = "currency = ?";
                $parameters[] = $params['currency'];
            }
            
            if (!empty($params['startDate'])) {
                $conditions[] = "transaction_date >= ?";
                $parameters[] = $params['startDate'];
            }
            
            if (!empty($params['endDate'])) {
                $conditions[] = "transaction_date <= ?";
                $parameters[] = $params['endDate'];
            }
            
            if (!empty($params['type'])) {
                $conditions[] = "transaction_type = ?";
                $parameters[] = $params['type'];
            }
            
            if (!empty($params['accountId'])) {
                $conditions[] = "(account_id = ? OR target_account_id = ?)";
                $parameters[] = $params['accountId'];
                $parameters[] = $params['accountId'];
            }
            
            if (!empty($params['subjectId'])) {
                $conditions[] = "subject_id = ?";
                $parameters[] = $params['subjectId'];
            }
            
            if (!empty($params['departmentId'])) {
                $conditions[] = "department_id = ?";
                $parameters[] = $params['departmentId'];
            }
            
            // 构建WHERE子句
            $whereClause = implode(" AND ", $conditions);
            
            $query = "SELECT COUNT(*) as total FROM " . $this->table_name . " WHERE " . $whereClause;
            $stmt = $this->conn->prepare($query);
            $stmt->execute($parameters);
            
            $row = $stmt->fetch();
            return (int)$row['total'];
        } catch (PDOException $e) {
            error_log("计算交易总数错误: " . $e->getMessage());
            return 0;
        }
    }
    
    /**
     * 获取交易摘要数据
     * 
     * @param int $projectId 项目ID
     * @param string $period 时间周期（today, month, year）
     * @return array 交易摘要数据
     */
    public function getSummary($projectId, $period = 'month') {
        try {
            // 初始化摘要数据
            $summary = [
                'income' => 0,
                'expense' => 0,
                'netIncome' => 0,
                'transferIn' => 0,
                'transferOut' => 0,
                'incomeBySubject' => [],
                'expenseBySubject' => [],
                'expenseByDepartment' => [],
                'byCurrency' => []
            ];
            
            // 设置日期范围
            $startDate = null;
            $endDate = date('Y-m-d');
            
            switch ($period) {
                case 'today':
                    $startDate = date('Y-m-d');
                    break;
                case 'month':
                    $startDate = date('Y-m-01');
                    break;
                case 'year':
                    $startDate = date('Y-01-01');
                    break;
                default:
                    $startDate = date('Y-m-01');
            }
            
            // 获取交易数据
            $query = "SELECT t.*, s.name as subject_name, d.name as department_name 
                      FROM " . $this->table_name . " t
                      LEFT JOIN subjects s ON t.subject_id = s.id
                      LEFT JOIN departments d ON t.department_id = d.id
                      WHERE t.project_id = ? AND t.transaction_date BETWEEN ? AND ?";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([$projectId, $startDate, $endDate]);
            
            while ($transaction = $stmt->fetch()) {
                $amount = (float)$transaction['amount'];
                $currency = $transaction['currency'];
                $type = $transaction['transaction_type'];
                $subjectName = $transaction['subject_name'] ?? '未分类';
                $departmentName = $transaction['department_name'] ?? '未分类';
                
                // 确保币种数组已初始化
                if (!isset($summary['byCurrency'][$currency])) {
                    $summary['byCurrency'][$currency] = [
                        'income' => 0,
                        'expense' => 0,
                        'netIncome' => 0,
                        'transferIn' => 0,
                        'transferOut' => 0
                    ];
                }
                
                // 按交易类型累加金额
                if ($type === 'income') {
                    $summary['income'] += $amount;
                    $summary['byCurrency'][$currency]['income'] += $amount;
                    
                    // 按科目累加收入
                    if (!isset($summary['incomeBySubject'][$subjectName])) {
                        $summary['incomeBySubject'][$subjectName] = 0;
                    }
                    $summary['incomeBySubject'][$subjectName] += $amount;
                }
                else if ($type === 'expense') {
                    $summary['expense'] += $amount;
                    $summary['byCurrency'][$currency]['expense'] += $amount;
                    
                    // 按科目累加支出
                    if (!isset($summary['expenseBySubject'][$subjectName])) {
                        $summary['expenseBySubject'][$subjectName] = 0;
                    }
                    $summary['expenseBySubject'][$subjectName] += $amount;
                    
                    // 按部门累加支出
                    if (!isset($summary['expenseByDepartment'][$departmentName])) {
                        $summary['expenseByDepartment'][$departmentName] = 0;
                    }
                    $summary['expenseByDepartment'][$departmentName] += $amount;
                }
                else if ($type === 'transfer') {
                    $summary['transferOut'] += $amount;
                    $summary['transferIn'] += $amount;
                    $summary['byCurrency'][$currency]['transferOut'] += $amount;
                    $summary['byCurrency'][$currency]['transferIn'] += $amount;
                }
            }
            
            // 计算净收入
            $summary['netIncome'] = $summary['income'] - $summary['expense'];
            
            // 计算每种币种的净收入
            foreach ($summary['byCurrency'] as $currency => $data) {
                $summary['byCurrency'][$currency]['netIncome'] = 
                    $data['income'] - $data['expense'];
            }
            
            // 转换科目收入数组为数组格式（用于图表）
            $incomeBySubjectArray = [];
            foreach ($summary['incomeBySubject'] as $subject => $amount) {
                $incomeBySubjectArray[] = [
                    'name' => $subject,
                    'value' => $amount
                ];
            }
            $summary['incomeBySubject'] = $incomeBySubjectArray;
            
            // 转换科目支出数组为数组格式（用于图表）
            $expenseBySubjectArray = [];
            foreach ($summary['expenseBySubject'] as $subject => $amount) {
                $expenseBySubjectArray[] = [
                    'name' => $subject,
                    'value' => $amount
                ];
            }
            $summary['expenseBySubject'] = $expenseBySubjectArray;
            
            // 转换部门支出数组为数组格式（用于图表）
            $expenseByDepartmentArray = [];
            foreach ($summary['expenseByDepartment'] as $department => $amount) {
                $expenseByDepartmentArray[] = [
                    'name' => $department,
                    'value' => $amount
                ];
            }
            $summary['expenseByDepartment'] = $expenseByDepartmentArray;
            
            return $summary;
        } catch (PDOException $e) {
            error_log("获取交易摘要错误: " . $e->getMessage());
            return [
                'income' => 0,
                'expense' => 0,
                'netIncome' => 0,
                'transferIn' => 0,
                'transferOut' => 0,
                'incomeBySubject' => [],
                'expenseBySubject' => [],
                'expenseByDepartment' => [],
                'byCurrency' => []
            ];
        }
    }
}