<?php
/**
 * 数据库初始化脚本
 * 替代原来的db_init.js，用于初始化数据库表结构和基础数据
 */

// 输出信息函数
function log_message($message) {
    echo "[" . date('Y-m-d H:i:s') . "] " . $message . PHP_EOL;
}

// 引入配置文件
require_once __DIR__ . '/config/config.php';

// 获取数据库连接
$database = new Database();
$db = $database->getConnection();

/**
 * 创建数据库表结构
 */
function create_tables($db) {
    try {
        log_message("开始创建数据库表...");

        // 检查数据库连接
        log_message("数据库连接状态: " . ($db ? "成功" : "失败"));

        // 用户表
        $db->exec("CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            full_name VARCHAR(100),
            email VARCHAR(100) UNIQUE,
            role VARCHAR(20) DEFAULT 'user',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        log_message("表 'users' 创建成功");

        // 项目表
        $db->exec("CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        )");
        log_message("表 'projects' 创建成功");

        // 用户-项目关联表
        $db->exec("CREATE TABLE IF NOT EXISTS user_projects (
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            role VARCHAR(20) DEFAULT 'member',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, project_id)
        )");
        log_message("表 'user_projects' 创建成功");

        // 超级管理员表
        $db->exec("CREATE TABLE IF NOT EXISTS super_admins (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        log_message("表 'super_admins' 创建成功");

        // 超级管理员项目表
        $db->exec("CREATE TABLE IF NOT EXISTS super_admin_projects (
            super_admin_id INTEGER REFERENCES super_admins(id) ON DELETE CASCADE,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (super_admin_id, project_id)
        )");
        log_message("表 'super_admin_projects' 创建成功");

        // 部门表
        $db->exec("CREATE TABLE IF NOT EXISTS departments (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50),
            description TEXT,
            parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (code, project_id)
        )");
        log_message("表 'departments' 创建成功");

        // 币种表
        $db->exec("CREATE TABLE IF NOT EXISTS currency_types (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL,
            code VARCHAR(10) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE (code, project_id)
        )");
        log_message("表 'currency_types' 创建成功");

        // 账户类型表
        $db->exec("CREATE TABLE IF NOT EXISTS account_types (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL,
            code VARCHAR(20),
            type VARCHAR(50) DEFAULT 'asset',
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE (name, project_id)
        )");
        log_message("表 'account_types' 创建成功");

        // 账户表
        $db->exec("CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            account_number VARCHAR(50),
            description TEXT,
            account_type VARCHAR(50) NOT NULL,
            currency_type VARCHAR(10) NOT NULL,
            initial_balance DECIMAL(15, 2) DEFAULT 0,
            balance DECIMAL(15, 2) DEFAULT 0,
            status VARCHAR(20) DEFAULT 'active',
            open_date DATE,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        log_message("表 'accounts' 创建成功");

        // 科目表
        $db->exec("CREATE TABLE IF NOT EXISTS subjects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(20),
            type VARCHAR(20) NOT NULL,
            description TEXT,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (code, project_id)
        )");
        log_message("表 'subjects' 创建成功");

        // 交易表
        $db->exec("CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            transaction_date DATE NOT NULL,
            type VARCHAR(20) NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            description TEXT,
            account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
            subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
            department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
            status VARCHAR(20) DEFAULT 'completed',
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        log_message("表 'transactions' 创建成功");

        // 活动日志表
        $db->exec("CREATE TABLE IF NOT EXISTS activity_logs (
            id SERIAL PRIMARY KEY,
            action VARCHAR(50) NOT NULL,
            target_type VARCHAR(50) NOT NULL,
            target_id INTEGER,
            description TEXT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        log_message("表 'activity_logs' 创建成功");

        // 会话表
        $db->exec("CREATE TABLE IF NOT EXISTS sessions (
            sid VARCHAR(255) PRIMARY KEY,
            sess JSON NOT NULL,
            expire TIMESTAMP NOT NULL
        )");
        log_message("表 'sessions' 创建成功");

        log_message("所有数据库表创建完成");
        return true;
    } catch (PDOException $e) {
        log_message("创建数据库表错误: " . $e->getMessage());
        return false;
    }
}

/**
 * 初始化基础数据
 */
function initialize_base_data($db) {
    try {
        log_message("开始初始化基础数据...");

        // 检查是否已有用户数据
        $stmt = $db->query("SELECT COUNT(*) as count FROM users");
        $userCount = $stmt->fetch(PDO::FETCH_ASSOC)['count'];

        // 如果已有用户数据，则跳过初始化
        if ($userCount > 0) {
            log_message("数据库已有用户数据，跳过初始化");
            return true;
        }

        // 创建管理员用户
        $adminPassword = password_hash('admin123', PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute(['admin', $adminPassword, '系统管理员', 'admin@example.com', 'admin']);
        $adminId = $db->lastInsertId();
        log_message("创建管理员用户 (ID: {$adminId})");

        // 创建测试用户 (phpuser/123456)
        $testPassword = password_hash('123456', PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute(['phpuser', $testPassword, 'PHP测试用户', 'phpuser@example.com', 'admin']);
        $testUserId = $db->lastInsertId();
        log_message("创建测试用户 (ID: {$testUserId})");

        // 将管理员设为超级管理员
        $stmt = $db->prepare("INSERT INTO super_admins (user_id) VALUES (?)");
        $stmt->execute([$adminId]);
        $superAdminId = $db->lastInsertId();
        log_message("将管理员设为超级管理员 (ID: {$superAdminId})");

        // 将测试用户设为超级管理员
        $stmt = $db->prepare("INSERT INTO super_admins (user_id) VALUES (?)");
        $stmt->execute([$testUserId]);
        $testSuperAdminId = $db->lastInsertId();
        log_message("将测试用户设为超级管理员 (ID: {$testSuperAdminId})");

        // 创建默认项目
        $stmt = $db->prepare("INSERT INTO projects (name, code, description) VALUES (?, ?, ?)");
        $stmt->execute(['演示项目', 'default', '系统演示项目']);
        $defaultProjectId = $db->lastInsertId();
        log_message("创建默认项目 (ID: {$defaultProjectId})");

        // 关联超级管理员和项目
        $stmt = $db->prepare("INSERT INTO super_admin_projects (super_admin_id, project_id) VALUES (?, ?)");
        $stmt->execute([$superAdminId, $defaultProjectId]);
        $stmt->execute([$testSuperAdminId, $defaultProjectId]);
        log_message("关联超级管理员和项目");

        // 创建部门数据
        $departments = [
            ['财务部', 'finance', '负责财务管理和会计工作'],
            ['市场部', 'marketing', '负责市场推广和营销活动'],
            ['技术部', 'tech', '负责技术开发和维护'],
            ['人事部', 'hr', '负责人力资源管理']
        ];

        $stmt = $db->prepare("INSERT INTO departments (name, code, description, project_id) VALUES (?, ?, ?, ?)");
        foreach ($departments as $dept) {
            $stmt->execute([$dept[0], $dept[1], $dept[2], $defaultProjectId]);
            log_message("创建部门: {$dept[0]}");
        }

        // 创建币种数据
        $currencies = [
            ['人民币', 'CNY', '中国法定货币'],
            ['美元', 'USD', '美国法定货币'],
            ['欧元', 'EUR', '欧盟法定货币'],
            ['日元', 'JPY', '日本法定货币']
        ];

        $stmt = $db->prepare("INSERT INTO currency_types (name, code, description, project_id) VALUES (?, ?, ?, ?)");
        foreach ($currencies as $currency) {
            $stmt->execute([$currency[0], $currency[1], $currency[2], $defaultProjectId]);
            log_message("创建币种: {$currency[0]}");
        }

        // 创建账户类型数据
        $accountTypes = [
            ['活期账户', 'current', 'asset', '日常使用的活期账户'],
            ['定期账户', 'fixed', 'asset', '定期存款账户'],
            ['信用卡', 'credit', 'liability', '信用卡账户'],
            ['投资账户', 'investment', 'asset', '用于投资的账户']
        ];

        $stmt = $db->prepare("INSERT INTO account_types (name, code, type, description, project_id) VALUES (?, ?, ?, ?, ?)");
        foreach ($accountTypes as $type) {
            $stmt->execute([$type[0], $type[1], $type[2], $type[3], $defaultProjectId]);
            log_message("创建账户类型: {$type[0]}");
        }

        // 创建科目数据
        $subjects = [
            ['工资收入', 'income-salary', 'income', '工资薪金收入'],
            ['投资收益', 'income-investment', 'income', '投资带来的收益'],
            ['其他收入', 'income-other', 'income', '其他杂项收入'],
            ['餐饮支出', 'expense-food', 'expense', '日常餐饮支出'],
            ['交通支出', 'expense-transport', 'expense', '交通费用支出'],
            ['住宿支出', 'expense-housing', 'expense', '房租等住宿支出'],
            ['教育支出', 'expense-education', 'expense', '教育相关支出'],
            ['其他支出', 'expense-other', 'expense', '其他杂项支出']
        ];

        $stmt = $db->prepare("INSERT INTO subjects (name, code, type, description, project_id) VALUES (?, ?, ?, ?, ?)");
        foreach ($subjects as $subject) {
            $stmt->execute([$subject[0], $subject[1], $subject[2], $subject[3], $defaultProjectId]);
            log_message("创建科目: {$subject[0]}");
        }

        // 创建示例账户
        $accounts = [
            ['工商银行', '6212xxxx', '活期账户', 'CNY', 10000],
            ['农业银行', '6228xxxx', '活期账户', 'CNY', 5000],
            ['美元账户', 'USD001', '活期账户', 'USD', 1000],
            ['投资账户', 'INV001', '投资账户', 'CNY', 50000]
        ];

        $stmt = $db->prepare("INSERT INTO accounts (name, account_number, account_type, currency_type, initial_balance, balance, project_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($accounts as $account) {
            $stmt->execute([$account[0], $account[1], $account[2], $account[3], $account[4], $account[4], $defaultProjectId, $adminId]);
            log_message("创建账户: {$account[0]}");
        }

        log_message("基础数据初始化完成");
        return true;
    } catch (PDOException $e) {
        log_message("初始化基础数据错误: " . $e->getMessage());
        return false;
    }
}

// 执行数据库初始化
log_message("开始数据库初始化");
if (create_tables($db)) {
    initialize_base_data($db);
}
log_message("数据库初始化完成");