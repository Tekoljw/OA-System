-- 账户表补齐前端表单已在收集、却无处存放的两个字段：
-- 银行名称与风控额度。此前它们被前端提交后在后端丢弃。
BEGIN;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_name    VARCHAR(100);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2) NOT NULL DEFAULT 0;
COMMIT;
