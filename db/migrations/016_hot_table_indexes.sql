-- 三张热表缺索引。
--
-- transactions 是全系统写入最频繁、列表查询最频繁的表，却只有主键：
-- 出入金页每翻一页都在全表扫描（2 万行实测 Seq Scan），
-- 数据继续涨下去列表会肉眼可见地变慢。
-- accounts 和 activity_logs 同样只有主键。

-- 列表按项目过滤 + 按日期倒序，做成复合索引可同时省掉排序
CREATE INDEX IF NOT EXISTS idx_transactions_project_date
    ON transactions(project_id, transaction_date DESC, id DESC);
-- 账户明细、按科目/部门统计各自的过滤列
CREATE INDEX IF NOT EXISTS idx_transactions_account  ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_subject  ON transactions(subject_id);
CREATE INDEX IF NOT EXISTS idx_transactions_dept     ON transactions(department_id);
-- 按一级流水类型筛选与统计
CREATE INDEX IF NOT EXISTS idx_transactions_type_code ON transactions(project_id, transaction_type_code);
-- 股东入资/分红汇总按股东聚合
CREATE INDEX IF NOT EXISTS idx_transactions_shareholder ON transactions(shareholder_id);

-- 账户列表按项目过滤
CREATE INDEX IF NOT EXISTS idx_accounts_project ON accounts(project_id);

-- 操作日志按项目 + 时间倒序翻页
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_time ON activity_logs(project_id, created_at DESC);
