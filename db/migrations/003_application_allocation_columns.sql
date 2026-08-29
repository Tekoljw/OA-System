-- 归帐结果应有独立字段，不应挤占用户填写的 content
BEGIN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS allocated_account_id INTEGER
    REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS allocated_subject_id INTEGER
    REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS allocated_at TIMESTAMP;
COMMIT;
