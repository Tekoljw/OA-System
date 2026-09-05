-- 补修 migration 019 之后、服务端时区真正生效之前，以 UTC 误写入的记录。
--
-- 019 把存量数据 +8 对齐，容器也设了 TZ/PGTZ。但 PGTZ 只作用于 postgres
-- 容器内的 psql 客户端 —— 应用是从另一个容器连进来的，session 拿到的仍是
-- 服务端默认时区 UTC，于是 DEFAULT CURRENT_TIMESTAMP 写入的还是 UTC 时间。
-- 表现为「在 psql 里查时区是对的，应用写进去的却差 8 小时」，
-- 是最难发现的那种半吊子状态：不报错，只在按时间排序时看出记录顺序颠倒。
--
-- 根因已由 postgres 的 -c timezone 启动参数 + ALTER DATABASE 修掉。
-- 这里只补修那个窗口内产生的记录。
--
-- 窗口判据：created_at 落在 2026-09-05 05:09~07:00 之间。
-- 019 已把所有存量记录整体 +8，最早的存量记录是 2026-08-28 10:41，
-- 因此 9 月 5 日这个时间段内不可能存在「正常的本地时间」记录，
-- 落在这里的只能是窗口期以 UTC 写入的，不会误伤。
DO $$
DECLARE
    r RECORD;
    n INTEGER := 0;
    total INTEGER := 0;
    cnt INTEGER;
BEGIN
    FOR r IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.data_type = 'timestamp without time zone'
          AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format(
            'UPDATE %I SET %I = %I + INTERVAL ''8 hours''
             WHERE %I >= TIMESTAMP ''2026-09-05 05:09:00''
               AND %I <  TIMESTAMP ''2026-09-05 07:00:00''',
            r.table_name, r.column_name, r.column_name, r.column_name, r.column_name
        );
        GET DIAGNOSTICS cnt = ROW_COUNT;
        total := total + cnt;
        n := n + 1;
    END LOOP;
    RAISE NOTICE '扫描 % 个时间列，修正 % 行', n, total;
END $$;
