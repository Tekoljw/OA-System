-- 退出登录要能真正让 token 失效。
--
-- JWT 是无状态的，POST /api/logout 此前只回一句「已成功注销」，
-- 服务端什么都没做 —— 实测退出后拿同一个 token 请求 /api/accounts 仍然
-- 返回 200，而且能一直用到 24 小时过期。共享电脑上点了退出、或者 token
-- 从日志里泄露出去，用户以为已经安全了，实际没有。
--
-- 不引入黑名单表，也不上 Redis（PHP 镜像里没装 redis 扩展）：
-- 在 users 上加一个「此刻之前签发的 token 一律作废」的时间戳即可。
-- AuthMiddleware 每次请求本来就要查 users 取 role/is_active，
-- 顺带多取一列，不增加任何查询。这个做法还天然支持「退出所有设备」。
--
-- 存 Unix 秒而不是 timestamp：JWT 的 iat 就是 Unix 秒，直接比大小，
-- 不用担心库时区与 token 时区不一致（这套系统刚从 UTC 切到 UTC+8，
-- 时间戳跨时区比较正是最容易出错的地方）。
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_after BIGINT;

COMMENT ON COLUMN users.tokens_valid_after IS
  '此 Unix 秒之前签发的 JWT 一律视为失效；退出登录时写入当前时间';
