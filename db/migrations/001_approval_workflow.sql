-- ============================================================
-- 审批工作流：申请单 / 内部划款单 / 金额分级审批规则
-- 设计要点：
--   * 账本仍在 transactions，申请单在执行前不碰账户余额
--   * 审批人只有两类：申请人所属部门主管（写死对应关系）、管理员（全局）
--   * 金额按「单天累计」匹配规则档
-- ============================================================

BEGIN;

-- ---------- 0. 补齐既有缺陷：部门主管 ----------
-- 前端 DepartmentDialog 早已提交 managerId，但表中无此列，一直被静默丢弃
ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_manager ON departments(manager_id);

-- ---------- 1. 申请单 ----------
CREATE TABLE IF NOT EXISTS applications (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    type             VARCHAR(30)  NOT NULL,           -- payment/income/purchase/sales/borrowing/lending
    title            VARCHAR(200) NOT NULL,
    amount           NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    currency_type    VARCHAR(10)  NOT NULL DEFAULT 'CNY',
    department_id    INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
    submitter_id     INTEGER REFERENCES users(id)       ON DELETE SET NULL,

    -- draft/pending/approved/rejected/ready_for_execution/to_be_allocated/to_be_executed/completed/cancelled
    status           VARCHAR(30)  NOT NULL DEFAULT 'pending',

    related_party    VARCHAR(200),
    due_date         DATE,
    content          TEXT,
    description      TEXT,
    images           JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- 审批汇总（明细在 application_approvals）
    current_step     INTEGER NOT NULL DEFAULT 1,
    rule_id          INTEGER,
    approved_at      TIMESTAMP,

    -- 执行后回填，账本记录仍然只存在于 transactions
    transaction_id   INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    executed_at      TIMESTAMP,
    executed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,

    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_project_status ON applications(project_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_submitter_date ON applications(submitter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_applications_department     ON applications(department_id);

-- ---------- 2. 内部划款单 ----------
-- 一次划款是一个业务事件，跨两条账本记录，且带汇率/手续费信息
-- （现有 createTransfer 接收 fees/to_amount 参与余额计算却从不落库，此表补上）
CREATE TABLE IF NOT EXISTS transfers (
    id                      SERIAL PRIMARY KEY,
    project_id              INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    from_account_id         INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    to_account_id           INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

    amount                  NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    to_amount               NUMERIC(15,2) NOT NULL CHECK (to_amount > 0),
    fees                    NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    exchange_loss           NUMERIC(15,2) NOT NULL DEFAULT 0,
    actual_exchange_rate    NUMERIC(18,8),
    official_exchange_rate  NUMERIC(18,8),

    reason                  TEXT,
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending',
    department_id           INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    submitter_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,

    current_step            INTEGER NOT NULL DEFAULT 1,
    rule_id                 INTEGER,
    approved_at             TIMESTAMP,

    out_transaction_id      INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    in_transaction_id       INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    executed_at             TIMESTAMP,
    executed_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,

    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT transfers_accounts_differ CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_project_status ON transfers(project_id, status);

-- ---------- 3. 审批规则档（后台可配） ----------
CREATE TABLE IF NOT EXISTS approval_rules (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name             VARCHAR(100) NOT NULL,
    application_type VARCHAR(30),                      -- NULL = 适用所有类型
    min_amount       NUMERIC(15,2) NOT NULL DEFAULT 0, -- 含
    max_amount       NUMERIC(15,2),                    -- NULL = 无上限；不含
    amount_scope     VARCHAR(10) NOT NULL DEFAULT 'daily'
                     CHECK (amount_scope IN ('single', 'daily')),
    priority         INTEGER NOT NULL DEFAULT 0,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT approval_rules_amount_range CHECK (max_amount IS NULL OR max_amount > min_amount)
);

CREATE INDEX IF NOT EXISTS idx_approval_rules_lookup
    ON approval_rules(project_id, active, min_amount);

-- ---------- 4. 规则的审批节点（串行分级） ----------
CREATE TABLE IF NOT EXISTS approval_rule_nodes (
    id             SERIAL PRIMARY KEY,
    rule_id        INTEGER NOT NULL REFERENCES approval_rules(id) ON DELETE CASCADE,
    step_order     INTEGER NOT NULL,
    -- applicant_dept_manager: 申请人所属部门主管（写死对应关系）
    -- role                  : 按角色，配合 required_count 实现多人会签
    approver_type  VARCHAR(30) NOT NULL
                   CHECK (approver_type IN ('applicant_dept_manager', 'role')),
    approver_role  VARCHAR(30),                        -- approver_type='role' 时使用，如 admin
    required_count INTEGER NOT NULL DEFAULT 1 CHECK (required_count >= 1),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (rule_id, step_order)
);

-- ---------- 5. 申请单的实际审批记录 ----------
CREATE TABLE IF NOT EXISTS application_approvals (
    id              SERIAL PRIMARY KEY,
    -- 申请单与划款单二选一
    application_id  INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    transfer_id     INTEGER REFERENCES transfers(id)    ON DELETE CASCADE,

    step_order      INTEGER NOT NULL,
    approver_type   VARCHAR(30) NOT NULL,
    candidate_role  VARCHAR(30),                       -- 角色型节点：谁有资格审
    candidate_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- 主管型节点：指定人
    required_count  INTEGER NOT NULL DEFAULT 1,

    approver_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- 实际审批人
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
    comment         TEXT,
    acted_at        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT approvals_target_exactly_one CHECK (
        (application_id IS NOT NULL AND transfer_id IS NULL) OR
        (application_id IS NULL AND transfer_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_approvals_application ON application_approvals(application_id, step_order);
CREATE INDEX IF NOT EXISTS idx_approvals_transfer    ON application_approvals(transfer_id, step_order);
CREATE INDEX IF NOT EXISTS idx_approvals_pending     ON application_approvals(status, candidate_role);

COMMIT;
