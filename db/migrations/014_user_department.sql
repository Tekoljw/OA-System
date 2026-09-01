-- 用户归属部门。
--
-- 用户管理界面一直有「部门」下拉并提交 department 字段，但 users 表没有这一列，
-- 选了存不下；部门页的成员数则是按项目统计的全部用户，每个部门都显示同一个数字。
-- 部门与用户之间此前根本没有关联。
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);

-- 已任命的部门主管必然属于该部门，先按主管关系回填一批
UPDATE users u SET department_id = d.id
FROM departments d
WHERE d.manager_id = u.id AND u.department_id IS NULL;
