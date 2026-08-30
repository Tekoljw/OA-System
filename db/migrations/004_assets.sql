-- ============================================================
-- 资产记录
-- 分类复用既有 asset_types 表，不另建分类表。
-- 核销（折旧）明细单独成表，便于逐次追溯，资产上只保留剩余价值汇总。
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS assets (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    name            VARCHAR(200) NOT NULL,
    asset_type_id   INTEGER REFERENCES asset_types(id) ON DELETE SET NULL,
    department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,

    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price      NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    total_price     NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    -- 剩余价值随核销递减，不得为负也不得超过原值
    remaining_value NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (remaining_value >= 0),
    currency_type   VARCHAR(10)  NOT NULL DEFAULT 'CNY',

    description     TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'normal'
                    CHECK (status IN ('normal', 'depreciating', 'written_off', 'disposed')),

    submitter_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approver_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at     TIMESTAMP,

    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT assets_remaining_not_exceed_total CHECK (remaining_value <= total_price)
);

CREATE INDEX IF NOT EXISTS idx_assets_project_status ON assets(project_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_type           ON assets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_assets_department     ON assets(department_id);

-- 核销/折旧明细
CREATE TABLE IF NOT EXISTS asset_depreciations (
    id           SERIAL PRIMARY KEY,
    asset_id     INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    amount       NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    description  TEXT,
    approver_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_depreciations_asset ON asset_depreciations(asset_id, created_at DESC);

COMMIT;
