-- ============================================================
-- 角色与权限
--
-- 此前角色是硬编码的两个，权限判断散落在若干处 role === 'admin'，
-- 权限管理页那 12 个勾选项后端完全没使用，「新增角色」只写 localStorage。
-- 本迁移把角色落库，使权限可配置。
--
-- 兼容策略：users.role 保留不动（存角色 code），新增 role_id 作为外键。
-- 内置的 admin / user 一并纳入 roles 表并标记 is_system，禁止删除。
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    -- code 与 users.role 对应；内置角色的 code 不可更改
    code        VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    -- 系统内置角色不可删除，也不允许改 code
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id        INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- 用户关联角色；保留 users.role 以免一次性改动所有读取点
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ---------- 内置角色 ----------
INSERT INTO roles (code, name, description, is_system)
VALUES
    ('admin', '管理员', '拥有系统全部权限，可管理用户、配置和所有业务数据', TRUE),
    ('user',  '普通用户', '可查看仪表盘、账户、交易和资产，可提交申请', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 管理员：全部 12 项
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r, unnest(ARRAY[
    'view_dashboard','view_accounts','verify_accounts','view_transactions',
    'view_assets','manage_assets','manage_my_applications','manage_pending_approvals',
    'manage_pending_accounting','manage_pending_execution','manage_configurations','manage_personnel'
]) AS k WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- 普通用户：维持现状的 5 项
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r, unnest(ARRAY[
    'view_dashboard','view_accounts','view_transactions','view_assets','manage_my_applications'
]) AS k WHERE r.code = 'user'
ON CONFLICT DO NOTHING;

-- 现有用户按 users.role 关联到对应角色
UPDATE users u SET role_id = r.id FROM roles r WHERE r.code = u.role AND u.role_id IS NULL;

COMMIT;
