-- 系统时区从 UTC 改为 Asia/Singapore（UTC+8），已有数据一次性对齐。
--
-- 背景：库、PHP、容器原先全是 UTC，而使用者在 UTC+8。数据本身没错，
-- 错的是「哪一天」的判断基准，实测影响四处：
--   1. 日期筛选：本地时间 0:00-7:59 的记录，筛「今天」筛不到（被算成昨天）
--   2. 主管每日审批额度：在本地时间早 8 点才重置，而不是午夜
--   3. 流水默认日期：本地时间 0:00-7:59 记的流水，日期写成前一天
--   4. 仪表盘本月/本年统计：月初、年初边界差 8 小时
--
-- 全库 52 个时间列都是 timestamp without time zone（不带时区的墙上时间），
-- 且全部由系统生成（created_at / updated_at / acted_at / approved_at /
-- executed_at / allocated_at / rate_updated_at / submitted_at / expire /
-- last_attempt）。用户手输的日期都是 date 类型，不在此列、不受影响。
--
-- 容器时区切到 UTC+8 之后，新写入的 now() 是本地墙上时间，而旧数据还是
-- UTC 墙上时间，两者会错开 8 小时。所以必须把存量数据整体 +8。
--
-- 特别注意这两个：不跟着调整会立刻出事 ——
--   sessions.expire      不调则 now() > expire，所有在线会话瞬间掉线
--   login_attempts.last_attempt  不调则限流窗口判断错乱，锁定形同虚设
--
-- 用系统目录枚举列，避免手写清单漏掉某一列（漏掉的那列会永久差 8 小时，
-- 而且不报错，只在对账时表现为「时间对不上」）。
DO $$
DECLARE
    r RECORD;
    n INTEGER := 0;
BEGIN
    FOR r IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.data_type = 'timestamp without time zone'
          AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.column_name
    LOOP
        EXECUTE format(
            'UPDATE %I SET %I = %I + INTERVAL ''8 hours'' WHERE %I IS NOT NULL',
            r.table_name, r.column_name, r.column_name, r.column_name
        );
        n := n + 1;
    END LOOP;
    RAISE NOTICE '已调整 % 个时间列', n;
END $$;
