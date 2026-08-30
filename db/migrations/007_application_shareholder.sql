-- 入资/分红也是收支，必须走审批。申请单需能携带股东，
-- 否则执行落账时股东科目的关联校验无法通过。
BEGIN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS shareholder_id INTEGER
    REFERENCES shareholders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_applications_shareholder ON applications(shareholder_id);
COMMIT;
