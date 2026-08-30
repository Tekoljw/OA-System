/**
 * M3 出入金交易测试（16 项）
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const fs = require('fs');

const BASE_URL = process.env.OA_BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api`;
const SHOT_DIR = '/home/ubuntu/OA-System/test-screenshots/m3';

const results = [];
function R(id, name, pass, detail = '') {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(token, method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  return { httpStatus: r.status, ...(await r.json()) };
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log('\n========================================');
  console.log('M3 出入金交易测试（16 项）');
  console.log('========================================\n');

  // 登录获取 token
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.fill('input[placeholder*="用户名"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.waitForTimeout(3000);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const projectId = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('currentProject')).id; } catch { return '1'; } });

  // 获取科目
  const subResp = await api(token, 'GET', `/subjects?projectId=${projectId}`);
  const incomeSub = (subResp.data || []).find(s => s.type === 'income');
  const expenseSub = (subResp.data || []).find(s => s.type === 'expense');
  // 动态选一个 CNY 账户：硬编码 id=1 在账户数增长后会落到分页之外，
  // 余额读不到便恒为 0，M3-08/09 的余额断言全部失真
  const accListInit = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=500`);
  const cnyAcc = (accListInit.data || []).find(a => a.currency_type === 'CNY');
  if (!cnyAcc) throw new Error('项目下没有 CNY 账户，无法测试交易');
  const testAccountId = cnyAcc.id;

  // ---- M3.1 交易列表 ----

  // M3-01 页面加载
  await page.goto(`${BASE_URL}/transactions/external`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const bodyText = await page.innerText('body');
  R('M3-01', '页面加载', bodyText.includes('收入') || bodyText.includes('支出') || bodyText.includes('出入金') || bodyText.includes('交易'),
    '页面包含出入金相关内容');
  await page.screenshot({ path: `${SHOT_DIR}/M3-01.png` });

  // M3-02 按币种 Tab 切换
  const curTabs = page.locator('[role="tab"]:has-text("CNY"), [role="tab"]:has-text("USD"), button:has-text("CNY"), button:has-text("USD")');
  const tabExists = await curTabs.count() > 0;
  R('M3-02', '币种Tab切换', tabExists, `检测到${await curTabs.count()}个币种Tab`);

  // M3-03 收入/支出筛选
  const filterBtns = page.locator('button:has-text("收入"), button:has-text("支出"), [role="tab"]:has-text("收入")');
  R('M3-03', '收入/支出筛选按钮', await filterBtns.count() > 0, `${await filterBtns.count()}个筛选按钮`);

  // M3-04 搜索功能
  const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="查找"], input[type="search"]');
  R('M3-04', '搜索功能', await searchInput.count() > 0, await searchInput.count() > 0 ? '搜索框存在' : '未找到搜索框');

  // M3-05 月度统计卡片
  const hasStats = bodyText.includes('本月') || bodyText.includes('收入') || bodyText.includes('余额');
  R('M3-05', '月度统计卡片', hasStats, hasStats ? '显示统计信息' : '无统计卡片');

  // ---- M3.2 创建交易 ----

  // 获取交易前余额
  const beforeResp = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=500`);
  const accBefore = (beforeResp.data || []).find(a => a.id == testAccountId);
  const balBefore = parseFloat(accBefore?.balance || 0);
  console.log(`  📊 账户#${testAccountId} 交易前余额: ${balBefore}`);

  // M3-06 创建收入
  const incResp = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'income', amount: 8000, description: 'M3测试收入',
    account_id: testAccountId, subject_id: incomeSub?.id || 1, transaction_date: '2026-08-28'
  });
  R('M3-06', 'API创建收入', incResp.success, incResp.success ? `ID=${incResp.data?.id}` : incResp.error?.message);

  // M3-07 创建支出
  const expResp = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'expense', amount: 3000, description: 'M3测试支出',
    account_id: testAccountId, subject_id: expenseSub?.id || 1, transaction_date: '2026-08-28'
  });
  R('M3-07', 'API创建支出', expResp.success, expResp.success ? `ID=${expResp.data?.id}` : expResp.error?.message);

  // M3-08 ⭐ 收入后余额增加
  const afterInc = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=500`);
  const accAfterInc = (afterInc.data || []).find(a => a.id == testAccountId);
  const balAfterAll = parseFloat(accAfterInc?.balance || 0);
  // 收入+8000 支出-3000 => 净变化 +5000
  const expectedBal = balBefore + 8000 - 3000;
  R('M3-08', '⭐收入后余额增加', Math.abs(balAfterAll - expectedBal) < 0.01,
    `前=${balBefore}, 后=${balAfterAll}, 期望=${expectedBal}, 差=${balAfterAll - expectedBal}`);

  // M3-09 ⭐ 支出后余额减少（与 M3-08 合并验证，净变化=+5000）
  R('M3-09', '⭐支出后余额减少', balAfterAll < balBefore + 8000,
    `收入后期望=${balBefore + 8000}, 实际=${balAfterAll}(减了3000支出)`);

  // M3-10 交易出现在列表中
  // 接口 limit 硬上限 200，交易总量早已超出，单页取不到本轮记录；需翻页查找
  let found = false, scanned = 0;
  for (let pg = 1; pg <= 20 && !found; pg++) {
    const r = await api(token, 'GET', `/transactions?projectId=${projectId}&limit=200&page=${pg}`);
    const batch = r.data || [];
    scanned += batch.length;
    found = batch.some(t => t.description === 'M3测试收入' || t.description === 'M3测试支出');
    if (batch.length < 200) break;
  }
  R('M3-10', '交易出现在列表', found, `扫描${scanned}条, 找到测试交易=${found}`);

  // ---- M3.3 验证规则 ----

  // M3-11 金额为空
  const r11 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'income', description: '空金额测试', account_id: 1, subject_id: 1
  });
  R('M3-11', '金额为空拒绝', !r11.success, r11.error?.message || '');

  // M3-12 金额为0
  const r12 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'income', amount: 0, description: '零金额', account_id: 1, subject_id: 1
  });
  R('M3-12', '金额为0拒绝', !r12.success, r12.error?.message || '');

  // M3-13 金额为负
  const r13 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'income', amount: -999, description: '负金额', account_id: 1, subject_id: 1
  });
  R('M3-13', '负数金额拒绝', !r13.success, r13.error?.message || '');

  // M3-14 无效交易类型
  const r14 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'abc', amount: 100, description: '无效类型', account_id: 1, subject_id: 1
  });
  R('M3-14', '无效交易类型拒绝', !r14.success, r14.error?.message || '');

  // M3-15 缺少 type
  const r15 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    amount: 100, description: '缺type', account_id: 1, subject_id: 1
  });
  R('M3-15', '缺少type拒绝', !r15.success, r15.error?.message || '');

  // M3-16 日期自动填充
  const r16 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'income', amount: 1, description: 'M3日期自动填充测试', account_id: 1, subject_id: 1
  });
  const today = new Date().toISOString().slice(0, 10);
  const autoDate = r16.data?.transaction_date;
  R('M3-16', '日期自动填充', r16.success && autoDate === today,
    `自动日期=${autoDate}, 今天=${today}`);

  // 清理：回退测试交易的余额影响（创建反向交易）
  // M3测试收入 8000 + M3测试支出 3000 + 日期测试 1 = 净 +5001
  await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'expense', amount: 5001, description: 'M3测试数据清理', account_id: testAccountId, subject_id: expenseSub?.id || 1
  });

  // ---- 汇总 ----
  console.log('\n========================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`M3 测试完成: ${pass} PASS / ${fail} FAIL (共 ${results.length} 项)`);
  console.log('========================================\n');

  fs.writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify({ module: 'M3', results, summary: { total: results.length, pass, fail } }, null, 2));
  await browser.close();
})();
