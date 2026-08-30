/**
 * M2 账户管理测试（14 项）
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const fs = require('fs');

const BASE_URL = process.env.OA_BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api`;
const SHOT_DIR = '/home/ubuntu/OA-System/test-screenshots/m2';

const results = [];
function R(id, name, pass, detail = '') {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(token, method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  return { status: r.status, ...(await r.json()) };
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log('\n========================================');
  console.log('M2 账户管理测试（14 项）');
  console.log('========================================\n');

  // 登录
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.fill('input[placeholder*="用户名"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.locator('button[type="submit"], button:has-text("登录")').first().click();
  await page.waitForTimeout(3000);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const projectId = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('currentProject')).id; } catch { return localStorage.getItem('projectId') || '1'; } });

  // ---- M2.1 账户列表 ----

  // M2-01 页面加载
  await page.goto(`${BASE_URL}/accounts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const bodyText = await page.innerText('body');
  const hasAccData = bodyText.includes('账户') || bodyText.includes('余额') || bodyText.includes('CNY') || bodyText.includes('USD');
  R('M2-01', '页面加载', hasAccData, hasAccData ? '页面包含账户相关内容' : '页面无账户数据');
  await page.screenshot({ path: `${SHOT_DIR}/M2-01.png` });

  // M2-02 账户信息展示
  const accResp = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=500`);
  const accounts = accResp.data || [];
  const hasFields = accounts.length > 0 && accounts[0].name && accounts[0].currency_type && accounts[0].balance !== undefined;
  R('M2-02', '账户信息完整', hasFields, `${accounts.length}个账户, 首个: ${accounts[0]?.name || 'N/A'}`);

  // M2-03 按币种筛选
  const cnyCur = await api(token, 'GET', `/accounts?projectId=${projectId}&currency=CNY`);
  const cnyItems = cnyCur.data || cnyCur.data || [];
  const allCNY = cnyItems.every(a => a.currency_type === 'CNY');
  R('M2-03', '按币种筛选(API)', cnyItems.length > 0 && allCNY, `${cnyItems.length}个CNY账户, 全部CNY=${allCNY}`);

  // M2-04 按类型筛选 — 使用 Tab 点击
  const typeTabs = page.locator('[role="tab"], button').filter({ hasText: /活期|定期|信用|投资|全部/ });
  const tabCount = await typeTabs.count();
  R('M2-04', '按类型筛选Tab存在', tabCount > 0, `检测到${tabCount}个类型Tab`);

  // ---- M2.2 创建账户 ----

  // M2-05 打开创建表单
  // 账户页的新建按钮文案是英文 Add Account，此前只匹配中文，恒为「未找到」
  const addBtn = page.locator(
    'main button:has-text("Add Account"), main button:has-text("添加"), ' +
    'main button:has-text("新增"), main button:has-text("新建"), main button:has-text("创建")'
  ).first();
  let dialogOpened = false;
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"], [class*="DialogContent"]');
    dialogOpened = await dialog.count() > 0;
    R('M2-05', '打开创建表单', dialogOpened, dialogOpened ? '对话框已弹出' : '对话框未弹出');
    await page.screenshot({ path: `${SHOT_DIR}/M2-05.png` });
    // 关闭
    if (dialogOpened) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  } else {
    R('M2-05', '打开创建表单', false, '未找到添加按钮');
  }

  // M2-06 必填验证（API 层）
  const emptyResp = await api(token, 'POST', `/accounts?projectId=${projectId}&limit=500`, { name: '', account_type: '', currency_type: '' });
  R('M2-06', '必填验证(空名称)', !emptyResp.success, emptyResp.success ? '空名称竟然通过' : `正确拒绝: ${emptyResp.error?.message || ''}`);

  // M2-07 正常创建
  const createData = {
    name: 'M2测试账户',
    account_type: '活期账户',
    currency_type: 'CNY',
    account_number: 'M2-TEST-001',
    initial_balance: 88888,
    balance: 88888,
    status: 'active',
    description: 'M2测试创建'
  };
  const createResp = await api(token, 'POST', `/accounts?projectId=${projectId}&limit=500`, createData);
  const newAccId = createResp.data?.id;
  R('M2-07', '正常创建账户', createResp.success && !!newAccId, createResp.success ? `ID=${newAccId}` : createResp.error?.message);

  // M2-08 空名称验证（补充详细）
  const emptyName2 = await api(token, 'POST', `/accounts?projectId=${projectId}&limit=500`, { name: '', account_type: '活期', currency_type: 'CNY' });
  R('M2-08', 'API空名称拒绝', !emptyName2.success, emptyName2.error?.message || '');

  // M2-09 币种/类型下拉数据
  const curTypes = await api(token, 'GET', `/currency-types?projectId=${projectId}`);
  const accTypes = await api(token, 'GET', `/account-types?projectId=${projectId}`);
  const hasCurData = curTypes.success && (curTypes.data?.length > 0);
  const hasAccTypeData = accTypes.success && (accTypes.data?.length > 0);
  R('M2-09', '币种/类型下拉数据', hasCurData && hasAccTypeData,
    `币种=${curTypes.data?.length || 0}个, 账户类型=${accTypes.data?.length || 0}个`);

  // ---- M2.3 编辑与删除 ----

  // M2-10 编辑账户
  let editOk = false;
  if (newAccId) {
    const editResp = await api(token, 'PUT', `/accounts/${newAccId}?projectId=${projectId}`, { name: 'M2测试已修改', description: '编辑测试' });
    editOk = editResp.success && editResp.data?.name === 'M2测试已修改';
    R('M2-10', '编辑账户', editOk, editOk ? `新名称=${editResp.data.name}` : editResp.error?.message);
  } else {
    R('M2-10', '编辑账户', false, '无可编辑账户(创建失败)');
  }

  // M2-11 编辑回显
  if (newAccId) {
    const detailResp = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=500`);
    const found = (detailResp.data || []).find(a => a.id == newAccId);
    R('M2-11', '编辑回显', found?.name === 'M2测试已修改', `查到名称=${found?.name || 'NOT_FOUND'}`);
  } else {
    R('M2-11', '编辑回显', false, '无可查询账户');
  }

  // M2-12 删除账户
  let deleteOk = false;
  if (newAccId) {
    const delResp = await api(token, 'DELETE', `/accounts/${newAccId}?projectId=${projectId}`);
    deleteOk = delResp.success;
    R('M2-12', '删除账户', deleteOk, deleteOk ? '删除成功' : delResp.error?.message);
  } else {
    R('M2-12', '删除账户', false, '无可删除账户');
  }

  // M2-13 删除确认弹窗
  // 本用例测的是「账户」删除，此前却打开资产记录页，测错了对象
  await page.goto(`${BASE_URL}/accounts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const delBtns = page.locator('main button[aria-label="删除账户"]');
  if (await delBtns.count() > 0) {
    await delBtns.first().click();
    await page.waitForTimeout(500);
    const confirmDialog = await page.locator('[role="alertdialog"], [class*="AlertDialog"]').count();
    R('M2-13', '删除确认弹窗', confirmDialog > 0, confirmDialog > 0 ? '弹出确认框' : '未弹出确认框，直接删除');
    await page.keyboard.press('Escape');
  } else {
    R('M2-13', '删除确认弹窗', false, '页面上未找到删除按钮');
  }
  await page.screenshot({ path: `${SHOT_DIR}/M2-13.png` });

  // M2-14 删除不存在的账户
  const del404 = await api(token, 'DELETE', `/accounts/99999?projectId=${projectId}`);
  R('M2-14', '删除不存在账户', !del404.success, `status=${del404.status || ''}, msg=${del404.error?.message || del404.message || ''}`);

  // ---- 汇总 ----
  console.log('\n========================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`M2 测试完成: ${pass} PASS / ${fail} FAIL (共 ${results.length} 项)`);
  console.log('========================================\n');

  fs.writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify({ module: 'M2', results, summary: { total: results.length, pass, fail } }, null, 2));
  await browser.close();
})();
