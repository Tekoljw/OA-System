-- ============================================================
-- 清理旧业务数据 + 建立四个纯收支类型的默认科目池
--
-- 旧数据（流水、申请单、借贷、资产、科目）产生于没有一级流水类型的阶段，
-- 无法回填正确的一级类型，保留下来只会让统计和衍生逻辑对不上，故清空。
-- 账户、部门、用户、币种、资产分类等基础配置保留。
-- ============================================================

BEGIN;

DELETE FROM application_approvals;
DELETE FROM applications;
DELETE FROM transfers;
DELETE FROM loan_settlements;
DELETE FROM asset_depreciations;
DELETE FROM transactions;
DELETE FROM loans;
DELETE FROM assets;
DELETE FROM subjects;

-- 流水清空后余额必须回到初始值，否则账户余额凭空多出一段无据可查的历史
UPDATE accounts SET balance = COALESCE(initial_balance, 0);

-- 四个纯收支类型各挂各的科目池；系统只预置最基础的一条，其余由用户自建
INSERT INTO subjects (name, code, type, description, project_id, transaction_type_code, is_system)
SELECT s.name, s.code, s.type, s.description, p.id, s.tt, FALSE
FROM projects p
CROSS JOIN (VALUES
    ('主营业务收入', 'main_default',      'income',  '主营收入的默认科目', 'main_income'),
    ('其他收入',     'other_inc_default', 'income',  '其他收入的默认科目', 'other_income'),
    ('日常营业支出', 'op_default',        'expense', '营业支出的默认科目', 'operating_expense'),
    ('其他支出',     'other_exp_default', 'expense', '其他支出的默认科目', 'other_expense')
) AS s(name, code, type, description, tt)
ON CONFLICT (code, project_id) DO NOTHING;

COMMIT;
