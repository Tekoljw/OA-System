-- ============================================================
-- 流水类型体系
--
-- 一级：transaction_types —— 系统固定，决定这笔流水是否衍生其他记录
-- 二级：由一级的 second_level 决定从哪个池子里选
--        subject      纯收支科目（可自建，各一级类型各挂各的）
--        loan_type    借贷分类（系统固定）
--        loan         具体某条借贷记录（用于还款销账）
--        asset_type   资产分类（可自建）
--        asset        具体某条资产记录（用于出售冲减）
--        shareholder  股东
--
-- 衍生记录必须被「做平」：
--   资产：出售走流水回冲 → 剩余部分由会计报损/减值 → 账面归零
--   借贷：还款走流水回冲 → 收不回的由会计手工销账 → 余额归零
-- 两类留痕记录（asset_depreciations / loan_settlements）永久保留。
-- ============================================================

-- ---------- 1. 一级流水类型（全局固定，不随项目） ----------
CREATE TABLE IF NOT EXISTS transaction_types (
    code           VARCHAR(40)  PRIMARY KEY,
    name           VARCHAR(50)  NOT NULL,
    direction      VARCHAR(10)  NOT NULL CHECK (direction IN ('income','expense')),
    second_level   VARCHAR(20)  NOT NULL
        CHECK (second_level IN ('subject','loan_type','loan','asset_type','asset','shareholder')),
    -- none 不衍生 / loan_new 建借贷 / loan_settle 冲减借贷
    -- asset_new 建资产 / asset_dispose 冲减资产 / shareholder 建股东往来
    derives        VARCHAR(20)  NOT NULL
        CHECK (derives IN ('none','loan_new','loan_settle','asset_new','asset_dispose','shareholder')),
    -- 仅 loan_type / loan 类型有意义：限定只能选该方向的借贷
    loan_direction VARCHAR(10)  CHECK (loan_direction IN ('lend','borrow')),
    sort_order     INTEGER      NOT NULL DEFAULT 0
);

INSERT INTO transaction_types (code, name, direction, second_level, derives, loan_direction, sort_order) VALUES
    ('main_income',            '主营收入',     'income',  'subject',     'none',          NULL,     10),
    ('other_income',           '其他收入',     'income',  'subject',     'none',          NULL,     20),
    ('asset_sale_income',      '出售资产收入', 'income',  'asset',       'asset_dispose', NULL,     30),
    ('loan_in_income',         '贷入收入',     'income',  'loan_type',   'loan_new',      'borrow', 40),
    ('repay_income',           '还款收入',     'income',  'loan',        'loan_settle',   'lend',   50),
    ('shareholder_investment', '股东入资',     'income',  'shareholder', 'shareholder',   NULL,     60),
    ('operating_expense',      '营业支出',     'expense', 'subject',     'none',          NULL,     10),
    ('other_expense',          '其他支出',     'expense', 'subject',     'none',          NULL,     20),
    ('asset_purchase_expense', '购买资产支出', 'expense', 'asset_type',  'asset_new',     NULL,     30),
    ('loan_out_expense',       '借款支出',     'expense', 'loan_type',   'loan_new',      'lend',   40),
    ('repay_expense',          '还款支出',     'expense', 'loan',        'loan_settle',   'borrow', 50),
    ('shareholder_dividend',   '股东分红',     'expense', 'shareholder', 'shareholder',   NULL,     60)
ON CONFLICT (code) DO NOTHING;

-- ---------- 2. 借贷分类（系统固定，不可编辑） ----------
-- lend   = 我们借出，钱在外面，别人欠我们
-- borrow = 我们借入，欠别人，将来要还
CREATE TABLE IF NOT EXISTS loan_types (
    code        VARCHAR(30) PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    direction   VARCHAR(10) NOT NULL CHECK (direction IN ('lend','borrow')),
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO loan_types (code, name, direction, description, sort_order) VALUES
    ('receivable',       '应收款',   'lend',   '已确认但尚未收到的款项',       10),
    ('prepaid',          '预付款',   'lend',   '预先支付给对方的款项',         20),
    ('deposit_paid',     '付出押金', 'lend',   '支付给对方、将来可收回的押金', 30),
    ('lend_out',         '借出',     'lend',   '借给对方的资金',               40),
    ('unearned',         '预收款',   'borrow', '预先收到、可能需要退还的款项', 50),
    ('payable',          '应付款',   'borrow', '已确认但尚未支付的款项',       60),
    ('deposit_received', '收取押金', 'borrow', '收取对方、将来需退还的押金',   70),
    ('borrow_in',        '借入',     'borrow', '向对方借入的资金',             80)
ON CONFLICT (code) DO NOTHING;

-- ---------- 3. 科目归属到一级类型 ----------
-- 「各挂各的」：选了主营收入就只能看到主营收入下的科目
ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS transaction_type_code VARCHAR(40) REFERENCES transaction_types(code),
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- 4. 借贷记录接入 ----------
ALTER TABLE loans
    ADD COLUMN IF NOT EXISTS type_code      VARCHAR(30) REFERENCES loan_types(code),
    ADD COLUMN IF NOT EXISTS transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;

-- 销账来源：transaction=还款流水回冲 / manual=会计手工销账（坏账、不打算还）
ALTER TABLE loan_settlements
    ADD COLUMN IF NOT EXISTS source         VARCHAR(20) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;

-- ---------- 5. 资产记录接入 ----------
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;

-- 冲减来源：sale=出售流水回冲 / impairment=会计减值 / writeoff=会计报损
ALTER TABLE asset_depreciations
    ADD COLUMN IF NOT EXISTS reason         VARCHAR(20) NOT NULL DEFAULT 'impairment',
    ADD COLUMN IF NOT EXISTS transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;

-- ---------- 6. 申请单与流水带上一级类型和衍生目标 ----------
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS transaction_type_code VARCHAR(40) REFERENCES transaction_types(code),
    ADD COLUMN IF NOT EXISTS loan_type_code        VARCHAR(30) REFERENCES loan_types(code),
    ADD COLUMN IF NOT EXISTS related_loan_id       INTEGER REFERENCES loans(id)  ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS related_asset_id      INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS asset_type_id         INTEGER REFERENCES asset_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS quantity              INTEGER NOT NULL DEFAULT 1;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS transaction_type_code VARCHAR(40) REFERENCES transaction_types(code),
    ADD COLUMN IF NOT EXISTS loan_id               INTEGER REFERENCES loans(id)  ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS asset_id              INTEGER REFERENCES assets(id) ON DELETE SET NULL;

-- ---------- 7. 会计角色 ----------
-- 写死的系统角色，可以有多个用户担任；超级管理员天然包含其权限
INSERT INTO roles (code, name, description, is_system)
VALUES ('accountant', '会计', '负责归账、资产报损变卖、借贷销账、汇率维护，账户增改仅会计可做', TRUE)
ON CONFLICT (code) DO UPDATE SET is_system = TRUE;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.k
FROM roles r
CROSS JOIN (VALUES
    ('view_dashboard'), ('view_accounts'), ('verify_accounts'),
    ('view_transactions'), ('view_assets'), ('manage_assets'),
    ('manage_my_applications'), ('manage_pending_accounting'),
    ('manage_pending_execution'), ('manage_accounting')
) AS p(k)
WHERE r.code = 'accountant'
ON CONFLICT DO NOTHING;

-- 管理员补上新权限键
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, 'manage_accounting' FROM roles r WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;
