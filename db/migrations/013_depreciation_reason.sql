-- 处置原因增加「折旧」。
-- 折旧、减值、报损是三回事，都由会计手动操作（系统不自动折旧），
-- 但记录上必须分得开：折旧是正常损耗分摊，减值是价值下跌，报损是资产灭失。
ALTER TABLE asset_depreciations DROP CONSTRAINT IF EXISTS asset_depreciations_reason_check;
ALTER TABLE asset_depreciations
    ADD CONSTRAINT asset_depreciations_reason_check
    CHECK (reason IN ('sale', 'impairment', 'writeoff', 'depreciation'));
