-- 给「seedBaseConfig 上线之前」创建的存量项目补齐基础配置。
--
-- 这些项目没有 currency_types / account_types，表现为：新建账户弹窗的两个下拉
-- 全是空的，且 Radix 的空下拉会展开成一条空白窄条盖住整个弹窗，
-- 点不到「确定」「取消」，看起来像界面卡死 —— 该项目下根本建不出账户。
--
-- 默认值与 ProjectRepository::seedBaseConfig() 保持一致：
-- USD 是换算锚点，rate_to_usd 恒为 1 且不自动取价；CNY 打开自动取价。
-- 部门刻意不补 —— 系统代建的部门没有主管，会让人误以为审批链已可用。

INSERT INTO currency_types (name, code, description, project_id, rate_to_usd, auto_fetch, valid_hours, rate_updated_at, rate_source)
SELECT v.name, v.code, v.description, p.id, v.rate_to_usd, v.auto_fetch, 24, v.updated_at, v.rate_source
FROM projects p
CROSS JOIN (VALUES
  ('美元',   'USD', '美国法定货币', 1::numeric, false, CURRENT_TIMESTAMP::timestamp, 'anchor'::varchar),
  ('人民币', 'CNY', '中国法定货币', NULL::numeric, true,  NULL::timestamp,            NULL::varchar)
) AS v(name, code, description, rate_to_usd, auto_fetch, updated_at, rate_source)
WHERE NOT EXISTS (
  SELECT 1 FROM currency_types c WHERE c.project_id = p.id AND c.code = v.code
);

INSERT INTO account_types (name, code, description, project_id)
SELECT v.name, v.code, v.description, p.id
FROM projects p
CROSS JOIN (VALUES
  ('活期账户', 'current',    '日常收支使用的活期账户'),
  ('定期账户', 'fixed',      '定期存款账户'),
  ('信用卡',   'credit',     '信用卡账户'),
  ('投资账户', 'investment', '投资理财账户')
) AS v(name, code, description)
WHERE NOT EXISTS (
  SELECT 1 FROM account_types t WHERE t.project_id = p.id AND t.code = v.code
);
