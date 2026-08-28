/**
 * M1 认证与权限测试（12 项）
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const fs = require('fs');

const BASE_URL = 'https://oa.starway.sg';
const API_URL = `${BASE_URL}/api`;
const SHOT_DIR = '/home/ubuntu/OA-System/test-screenshots/m1';

const results = [];
function R(id, name, pass, detail = '') {
  const s = pass ? 'PASS' : 'FAIL';
  results.push({ id, name, status: s, detail });
  console.log(`${pass ? '✅' : '❌'} ${id} ${name}: ${s}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log('\n========================================');
  console.log('M1 认证与权限测试（12 项）');
  console.log('========================================\n');

  // ---- M1.1 登录流程 ----

  // M1-01 空表单提交
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const loginBtn = page.locator('button[type="submit"], button:has-text("登录")').first();
  await loginBtn.click();
  await page.waitForTimeout(800);
  R('M1-01', '空表单提交', page.url().includes('login'), `URL=${page.url()}`);
  await page.screenshot({ path: `${SHOT_DIR}/M1-01.png` });

  // M1-02 仅输入用户名
  await page.fill('input[placeholder*="用户名"], input[name="username"]', 'admin');
  await loginBtn.click();
  await page.waitForTimeout(800);
  R('M1-02', '仅输入用户名', page.url().includes('login'), `URL=${page.url()}`);

  // M1-03 错误密码
  await page.fill('input[placeholder*="用户名"], input[name="username"]', 'admin');
  await page.fill('input[placeholder*="密码"], input[type="password"]', 'wrong123');
  await loginBtn.click();
  await page.waitForTimeout(2000);
  const hasErrorToast = await page.locator('[role="alert"], [class*="destructive"], [class*="Toaster"] [data-state]').count();
  R('M1-03', '错误密码拒绝登录', page.url().includes('login'), `错误提示: ${hasErrorToast > 0 ? '有' : '无'}`);
  await page.screenshot({ path: `${SHOT_DIR}/M1-03.png` });

  // M1-04 不存在的用户
  await page.fill('input[placeholder*="用户名"], input[name="username"]', '');
  await page.fill('input[type="password"]', '');
  await page.fill('input[placeholder*="用户名"], input[name="username"]', 'nouser_xyz');
  await page.fill('input[type="password"]', '123456');
  await loginBtn.click();
  await page.waitForTimeout(2000);
  R('M1-04', '不存在的用户', page.url().includes('login'), `URL=${page.url()}`);

  // M1-05 正确登录
  await page.fill('input[placeholder*="用户名"], input[name="username"]', '');
  await page.fill('input[type="password"]', '');
  await page.fill('input[placeholder*="用户名"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await loginBtn.click();
  await page.waitForTimeout(3000);
  const loggedIn = !page.url().includes('login');
  R('M1-05', '正确登录', loggedIn, `跳转到 ${page.url()}`);
  await page.screenshot({ path: `${SHOT_DIR}/M1-05.png` });

  if (!loggedIn) { console.log('登录失败，终止'); await browser.close(); return; }

  // ---- M1.2 Token 与会话 ----

  // M1-06 Token 存储
  const token = await page.evaluate(() => localStorage.getItem('token'));
  R('M1-06', 'Token存储', !!token && token.length > 100, `token长度=${token?.length || 0}`);

  // M1-07 项目信息存储
  const projRaw = await page.evaluate(() => localStorage.getItem('currentProject'));
  let projOk = false;
  let projId = null;
  try {
    const p = JSON.parse(projRaw);
    projId = p?.id;
    projOk = !!projId;
  } catch {}
  if (!projOk) {
    const pid = await page.evaluate(() => localStorage.getItem('projectId'));
    projId = pid;
    projOk = !!pid;
  }
  R('M1-07', '项目信息存储', projOk, `projectId=${projId}`);

  // M1-08 无效 Token 访问
  const r08 = await fetch(`${API_URL}/accounts?projectId=1`, {
    headers: { 'Authorization': 'Bearer invalid_token_xyz' }
  });
  R('M1-08', '无效Token返回401', r08.status === 401, `status=${r08.status}`);

  // M1-09 无 Token 访问
  const r09 = await fetch(`${API_URL}/accounts?projectId=1`);
  R('M1-09', '无Token返回401', r09.status === 401, `status=${r09.status}`);

  // M1-10 Token 过期处理（用篡改的过期 token 模拟）
  // 构造一个修改了 exp 的 token 来测试
  const r10 = await fetch(`${API_URL}/accounts?projectId=1`, {
    headers: { 'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsIm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ.invalid' }
  });
  R('M1-10', 'Token过期/伪造返回401', r10.status === 401, `status=${r10.status}`);

  // ---- M1.3 登出 ----

  // M1-11 正常登出
  // 查找退出按钮
  const logoutBtn = page.locator('button:has-text("退出"), button:has-text("登出"), button:has-text("注销"), [aria-label="logout"], [title="退出"]').first();
  let logoutOk = false;
  if (await logoutBtn.count() > 0) {
    await logoutBtn.click();
    await page.waitForTimeout(2000);
    const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
    logoutOk = !tokenAfter || page.url().includes('login');
    R('M1-11', '正常登出', logoutOk, `token清除=${!tokenAfter}, URL=${page.url()}`);
  } else {
    // 有些系统退出在下拉菜单里
    const avatarBtn = page.locator('[class*="avatar"], [class*="Avatar"], button:has([class*="User"])').first();
    if (await avatarBtn.count() > 0) {
      await avatarBtn.click();
      await page.waitForTimeout(500);
      const menuLogout = page.locator('text=退出, text=登出, text=注销').first();
      if (await menuLogout.count() > 0) {
        await menuLogout.click();
        await page.waitForTimeout(2000);
        const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
        logoutOk = !tokenAfter || page.url().includes('login');
      }
    }
    R('M1-11', '正常登出', logoutOk, logoutOk ? '登出成功' : '未找到退出按钮或登出流程异常');
  }
  await page.screenshot({ path: `${SHOT_DIR}/M1-11.png` });

  // M1-12 登出后访问保护页面
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const redirectedToLogin = page.url().includes('login');
  R('M1-12', '登出后重定向到登录页', redirectedToLogin, `URL=${page.url()}`);
  await page.screenshot({ path: `${SHOT_DIR}/M1-12.png` });

  // ---- 汇总 ----
  console.log('\n========================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`M1 测试完成: ${pass} PASS / ${fail} FAIL (共 ${results.length} 项)`);
  console.log('========================================\n');

  fs.writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify({ module: 'M1', results, summary: { total: results.length, pass, fail } }, null, 2));

  await browser.close();
})();
