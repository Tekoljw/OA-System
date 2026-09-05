-- OA System PostgreSQL 初始化脚本

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 用户-项目关联表
CREATE TABLE IF NOT EXISTS user_projects (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, project_id)
);

-- 超级管理员表
CREATE TABLE IF NOT EXISTS super_admins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 超级管理员项目表
CREATE TABLE IF NOT EXISTS super_admin_projects (
    super_admin_id INTEGER REFERENCES super_admins(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (super_admin_id, project_id)
);

-- 部门表
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (code, project_id)
);

-- 币种表
CREATE TABLE IF NOT EXISTS currency_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(10) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (code, project_id)
);

-- 账户类型表
CREATE TABLE IF NOT EXISTS account_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20),
    type VARCHAR(50) DEFAULT 'asset',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (name, project_id)
);

-- 账户表
CREATE TABLE IF NOT EXISTS accounts (
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
    project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 科目表
CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    type VARCHAR(20) NOT NULL,
    description TEXT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (code, project_id)
);

-- 资产分类表
-- 这张表长期缺失于所有建库脚本 —— 生产库里有，是当初手工建的，
-- 从零部署时 004_assets.sql 会在 asset_type_id 的外键上报
-- relation "asset_types" does not exist，连带 assets、asset_depreciations
-- 两张表也建不出来，010 / 011 / 013 / 016 四个迁移跟着失败。
-- 结构照生产库现状补齐；只依赖 projects 与 users，放在这里即可。
CREATE TABLE IF NOT EXISTS asset_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    depreciation_rate NUMERIC(5,2) DEFAULT 0,
    useful_life INTEGER DEFAULT 0,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 股东表
-- 必须排在 transactions 之前：transactions.shareholder_id 有指向它的外键，
-- 顺序反了会在建 transactions 时报 relation "shareholders" does not exist，
-- 整个 init.sql 就此中断，后面的表一个都建不出来。
CREATE TABLE IF NOT EXISTS shareholders (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    share_ratio DECIMAL(5,2) NOT NULL DEFAULT 0,
    contact VARCHAR(100),
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, project_id)
);

-- 交易表
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    shareholder_id INTEGER REFERENCES shareholders(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'completed',
    project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- 活动日志表
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id INTEGER,
    description TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 登录限流表
CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_key VARCHAR(64) PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP NOT NULL
);

-- 初始数据

-- 管理员用户
-- 两个老问题一并修掉：
--   1. 注释写着 admin/admin123，哈希却是「password」对应的值 —— 新部署后
--      按注释根本登不进去，而真正能登的是弱口令 password。
--   2. phpuser 的哈希是占位符 $2y$10$YourHashedPasswordHere，不是合法 bcrypt，
--      新部署会建出一个永远无法登录的僵尸管理员账号。那是测试残留，删掉。
-- 现在 admin 的种子密码确实是 admin123。⚠️ 部署后请立即在「修改密码」里改掉，
-- 这是公开在版本库里的默认口令。
INSERT INTO users (username, password, full_name, email, role) VALUES
    ('admin', '$2y$10$6CDEkL6AShnvp4GB4sTjsehwu4hfEVWVtHlLE.uG8F.Vx9Ly9wG8y', '系统管理员', 'admin@example.com', 'admin')
ON CONFLICT (username) DO NOTHING;

-- 超级管理员
INSERT INTO super_admins (user_id)
SELECT id FROM users WHERE username = 'admin'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO super_admins (user_id)
SELECT id FROM users WHERE username = 'phpuser'
ON CONFLICT (user_id) DO NOTHING;

-- 默认项目
INSERT INTO projects (name, code, description) VALUES
    ('演示项目', 'default', '系统演示项目')
ON CONFLICT (code) DO NOTHING;

-- 关联超级管理员和项目
INSERT INTO super_admin_projects (super_admin_id, project_id)
SELECT sa.id, p.id FROM super_admins sa, projects p
WHERE sa.user_id = (SELECT id FROM users WHERE username = 'admin')
AND p.code = 'default'
ON CONFLICT DO NOTHING;

-- 部门
INSERT INTO departments (name, code, description, project_id)
SELECT d.name, d.code, d.description, p.id
FROM (VALUES
    ('财务部', 'finance', '负责财务管理和会计工作'),
    ('市场部', 'marketing', '负责市场推广和营销活动'),
    ('技术部', 'tech', '负责技术开发和维护'),
    ('人事部', 'hr', '负责人力资源管理')
) AS d(name, code, description),
projects p WHERE p.code = 'default'
ON CONFLICT (code, project_id) DO NOTHING;

-- 币种
INSERT INTO currency_types (name, code, description, project_id)
SELECT c.name, c.code, c.description, p.id
FROM (VALUES
    ('人民币', 'CNY', '中国法定货币'),
    ('美元', 'USD', '美国法定货币'),
    ('欧元', 'EUR', '欧盟法定货币'),
    ('日元', 'JPY', '日本法定货币')
) AS c(name, code, description),
projects p WHERE p.code = 'default'
ON CONFLICT (code, project_id) DO NOTHING;

-- 账户类型
INSERT INTO account_types (name, code, type, description, project_id)
SELECT at.name, at.code, at.type, at.description, p.id
FROM (VALUES
    ('活期账户', 'current', 'asset', '日常使用的活期账户'),
    ('定期账户', 'fixed', 'asset', '定期存款账户'),
    ('信用卡', 'credit', 'liability', '信用卡账户'),
    ('投资账户', 'investment', 'asset', '用于投资的账户')
) AS at(name, code, type, description),
projects p WHERE p.code = 'default'
ON CONFLICT (name, project_id) DO NOTHING;

-- 科目
INSERT INTO subjects (name, code, type, description, project_id)
SELECT s.name, s.code, s.type, s.description, p.id
FROM (VALUES
    ('工资收入', 'income-salary', 'income', '工资薪金收入'),
    ('投资收益', 'income-investment', 'income', '投资带来的收益'),
    ('其他收入', 'income-other', 'income', '其他杂项收入'),
    ('股东入资', 'income-shareholder', 'income', '股东资本金注入'),
    ('餐饮支出', 'expense-food', 'expense', '日常餐饮支出'),
    ('交通支出', 'expense-transport', 'expense', '交通费用支出'),
    ('住宿支出', 'expense-housing', 'expense', '房租等住宿支出'),
    ('教育支出', 'expense-education', 'expense', '教育相关支出'),
    ('其他支出', 'expense-other', 'expense', '其他杂项支出'),
    ('股东分红', 'expense-dividend', 'expense', '按股份比例分配利润')
) AS s(name, code, type, description),
projects p WHERE p.code = 'default'
ON CONFLICT (code, project_id) DO NOTHING;
