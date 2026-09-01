-- 借贷类型改由 loan_types 表管辖（8 种，押金拆成付出/收取两种方向），
-- 原来写死 7 种中文的 CHECK 约束会挡住新类型，去掉。
-- type 列保留中文名用于展示，type_code 才是权威归类。
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_type_check;
