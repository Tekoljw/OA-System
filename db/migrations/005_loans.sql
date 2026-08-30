-- ============================================================
-- 借贷记录
-- 与资产记录同构：主表存金额与剩余未结金额，结算明细单独成表。
-- 类型（应收款/预付款/借出…）沿用前端既有枚举，以文本存储，
-- 不再单独建类型表——asset_types 语义是资产分类，不适合复用。
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS loans (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,

    type             VARCHAR(20) NOT NULL
                     CHECK (type IN ('应收款','预收款','应付款','预付款','押金','借出','借入')),
    direction        VARCHAR(10) NOT NULL CHECK (direction IN ('借出','借入')),
    currency         VARCHAR(10) NOT NULL DEFAULT 'CNY',

    amount           NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    -- 结算后递减，归零即已完成
    remaining_amount NUMERIC(15,2) NOT NULL CHECK (remaining_amount >= 0),

    borrower         VARCHAR(200),
    repayment_date   DATE,
    description      TEXT,
    department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,

    status           VARCHAR(20) NOT NULL DEFAULT '待审批'
                     CHECK (status IN ('待审批','已审批','已驳回','已完成')),

    submitter_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approver_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at      TIMESTAMP,

    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT loans_remaining_not_exceed_amount CHECK (remaining_amount <= amount)
);

CREATE INDEX IF NOT EXISTS idx_loans_project_status ON loans(project_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_type           ON loans(project_id, type);

CREATE TABLE IF NOT EXISTS loan_settlements (
    id          SERIAL PRIMARY KEY,
    loan_id     INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    amount      NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loan_settlements_loan ON loan_settlements(loan_id, created_at DESC);

COMMIT;
