-- 用户备注。
-- 用户表单一直有「备注」输入框并提交 notes，但 users 表没有这一列，填了直接丢。
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
