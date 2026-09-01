-- ============================================================
-- 币种汇率
--
-- 此前系统没有汇率数据，仪表盘把不同币种的余额直接相加
-- （7,583,748 CNY + 53,500 USD 当成一个数），得出的总额没有意义。
--
-- 汇率一律以 USD 为锚：rate_to_usd 表示「1 单位该币种 = 多少 USD」。
-- 用户在顶栏选择的展示本位币只影响换算目标，不改变存储口径。
-- ============================================================

BEGIN;

ALTER TABLE currency_types
    -- 1 单位该币种折合多少 USD。USD 自身恒为 1。
    ADD COLUMN IF NOT EXISTS rate_to_usd     NUMERIC(20,10),
    -- 开启后由系统定时从公开报价拉取；关闭则必须人工维护
    ADD COLUMN IF NOT EXISTS auto_fetch      BOOLEAN NOT NULL DEFAULT FALSE,
    -- 手动维护模式下的有效期（小时）。超期即视为失效，不再参与换算。
    ADD COLUMN IF NOT EXISTS valid_hours     INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS rate_updated_at TIMESTAMP,
    -- 记录来源，便于排查：auto / manual
    ADD COLUMN IF NOT EXISTS rate_source     VARCHAR(20);

-- USD 是锚，汇率恒为 1 且永不过期
UPDATE currency_types
   SET rate_to_usd = 1, rate_updated_at = NOW(), rate_source = 'anchor'
 WHERE code = 'USD';

-- 用户偏好的展示本位币；未设置时按 USD
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_currency VARCHAR(10) NOT NULL DEFAULT 'USD';

COMMIT;
