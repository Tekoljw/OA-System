-- ============================================================
-- 默认审批规则种子数据（对应需求中的三档金额）
-- 金额口径：部门主管当日审批额度累计
--   = 该主管当天已审批通过且未被否决的单据金额合计 + 本次金额
--   相当于给主管设每日审批权限上限，超出则本单升级到更高一级审批
-- 这些数值和人数均可在「配置管理 → 审批规则」页面修改
-- ============================================================

BEGIN;

DO $$
DECLARE
    p        RECORD;
    rule_id  INTEGER;
BEGIN
FOR p IN SELECT id FROM projects LOOP

    -- 档位一：0 ~ 100，部门主管 ×1
    IF NOT EXISTS (SELECT 1 FROM approval_rules WHERE project_id = p.id AND name = '小额（部门主管）') THEN
        INSERT INTO approval_rules (project_id, name, min_amount, max_amount, amount_scope, priority)
        VALUES (p.id, '小额（部门主管）', 0, 100, 'daily', 10)
        RETURNING id INTO rule_id;

        INSERT INTO approval_rule_nodes (rule_id, step_order, approver_type, required_count)
        VALUES (rule_id, 1, 'applicant_dept_manager', 1);
    END IF;

    -- 档位二：100 ~ 10000，部门主管 ×1 → 管理员 ×1
    IF NOT EXISTS (SELECT 1 FROM approval_rules WHERE project_id = p.id AND name = '中额（部门主管 + 管理员）') THEN
        INSERT INTO approval_rules (project_id, name, min_amount, max_amount, amount_scope, priority)
        VALUES (p.id, '中额（部门主管 + 管理员）', 100, 10000, 'daily', 20)
        RETURNING id INTO rule_id;

        INSERT INTO approval_rule_nodes (rule_id, step_order, approver_type, approver_role, required_count) VALUES
            (rule_id, 1, 'applicant_dept_manager', NULL,    1),
            (rule_id, 2, 'role',                   'admin', 1);
    END IF;

    -- 档位三：10000 以上，部门主管 ×1 → 管理员 ×2 会签
    IF NOT EXISTS (SELECT 1 FROM approval_rules WHERE project_id = p.id AND name = '大额（部门主管 + 多名管理员会签）') THEN
        INSERT INTO approval_rules (project_id, name, min_amount, max_amount, amount_scope, priority)
        VALUES (p.id, '大额（部门主管 + 多名管理员会签）', 10000, NULL, 'daily', 30)
        RETURNING id INTO rule_id;

        INSERT INTO approval_rule_nodes (rule_id, step_order, approver_type, approver_role, required_count) VALUES
            (rule_id, 1, 'applicant_dept_manager', NULL,    1),
            (rule_id, 2, 'role',                   'admin', 2);
    END IF;

END LOOP;
END $$;

COMMIT;
