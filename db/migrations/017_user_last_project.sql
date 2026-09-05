-- 记住用户最后选择的项目。
--
-- 此前 switchProject() 只校验权限并返回项目，什么都不落库，而 getUserInfo()
-- 硬编码返回 projectsList[0]。结果是：用户在界面上切换项目 → 前端 localStorage
-- 更新 → 页面一刷新，GET /api/user 又返回第一个项目，把选择覆盖回去。
-- 用户会在毫无提示的情况下回到旧项目，进而把数据录进错误的项目。

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_project_id INTEGER;

-- 项目被删除时置空，回落到第一个可访问项目，不残留悬空引用
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_last_project_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_last_project_id_fkey
      FOREIGN KEY (last_project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;
