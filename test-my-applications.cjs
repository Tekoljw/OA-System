/**
 * 我的申请：提交路径与可见性隔离
 *
 * 收支只能由审批流产生，本页是整个链条的起点（员工发起申请）。
 * 同时验证「我的申请」名副其实：只应看到自己提交的，
 * 且不能通过改参数看别人的。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const http = require('http');
const { psql } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'MY' + Date.now().toString().slice(-6);
let passed = 0, failed = 0;
const assert = (n, c, d = '') => c ? (passed++, console.log(`  ✅ ${n}`))
                                   : (failed++, console.log(`  ❌ ${n} ${d}`));

function api(method, path, token, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search,
                       method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
        const req = http.request(opts, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(d) }); }
                                  catch { resolve({ status: res.statusCode, raw: d }); } });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function resetFixtures() {
    psql(`
        DELETE FROM application_approvals WHERE application_id IN
            (SELECT id FROM applications WHERE project_id=1 AND title LIKE 'MY%');
        DELETE FROM applications WHERE project_id=1 AND title LIKE 'MY%';`, '我的申请清理');
    console.log('  🧹 已清理测试申请');
}

async function login(page, user, pw) {
    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', user);
    await page.fill('input[placeholder*="密码"]', pw);
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    return await page.evaluate(() => localStorage.getItem('token'));
}

(async () => {
    resetFixtures();
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    page.on('response', r => {
        if (r.url().includes('/api/') && r.status() >= 400 && r.request().method() !== 'GET') {
            errs.push(`${r.request().method()} ${r.status()} ${r.url().replace(BASE, '')}`);
        }
    });

    const U = await login(page, 'testuser', 'user123');
    assert('普通用户登录', !!U);
    const adminLogin = await api('POST', '/api/login', '', { username: 'admin', password: 'admin123' });
    const T = adminLogin?.data?.token;

    // ---------- 1. 界面提交申请 ----------
    console.log('\n[1] 界面提交付款申请');
    await page.goto(`${BASE}/workflows/my-applications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const before = await page.locator('tbody tr').count();

    await page.locator('button', { hasText: '申请付款' }).first().click();
    await page.waitForTimeout(1300);
    const dlg = page.locator('[role="dialog"]').first();
    assert('申请弹窗打开', await dlg.count() === 1);

    await dlg.locator('input[name="title"]').fill(`${TAG}办公用品`);
    await dlg.locator('input[name="amount"]').fill('88');
    await dlg.locator('textarea[name="description"]').fill('界面提交验证');
    // 申请部门为必填下拉
    const deptTrigger = dlg.locator('button', { hasText: /请选择|部门/ }).first();
    if (await deptTrigger.count()) {
        await deptTrigger.click();
        await page.waitForTimeout(600);
        const opt = page.locator('[role="option"]').first();
        if (await opt.count()) { await opt.click(); await page.waitForTimeout(400); }
    }
    await dlg.locator('button', { hasText: '提交' }).last().click();
    await page.waitForTimeout(2500);

    const mine = await api('GET', '/api/applications?projectId=1&type=all&mine=1&limit=100', U);
    const created = (mine?.data?.applications || []).find(a => a.title === `${TAG}办公用品`);
    assert('申请已落库', !!created, `当前 ${mine?.data?.total} 条`);
    assert('提交人记为当前登录用户', created && Number(created.userId) === 3, `userId=${created?.userId}`);
    assert('金额正确', created && Number(created.amount) === 88, `amount=${created?.amount}`);
    assert('初始状态为待审批', created && created.status === 'pending', `status=${created?.status}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    assert('列表新增一行', await page.locator('tbody tr').count() === before + 1,
           `前 ${before} 后 ${await page.locator('tbody tr').count()}`);

    // ---------- 2. 可见性隔离 ----------
    console.log('\n[2] 只应看到自己提交的申请');
    const adminApp = await api('POST', '/api/applications?projectId=1', T, {
        type: 'expense', title: `${TAG}管理员的申请`, amount: 50, departmentId: 1,
    });
    assert('管理员另建一条申请', adminApp.status === 201);

    const mine2 = await api('GET', '/api/applications?projectId=1&type=all&mine=1&limit=200', U);
    const others = (mine2?.data?.applications || []).filter(a => Number(a.userId) !== 3);
    assert('列表不含他人申请', others.length === 0,
           `混入 ${others.length} 条：${others.slice(0, 3).map(a => a.title).join('、')}`);
    assert('看不到管理员刚建的那条',
           !(mine2?.data?.applications || []).some(a => a.title === `${TAG}管理员的申请`));

    // 冒充他人
    const spoof = await api('GET', '/api/applications?projectId=1&type=all&mine=1&submitter_id=1&limit=200', U);
    const spoofed = (spoof?.data?.applications || []).filter(a => Number(a.userId) !== 3);
    assert('传 submitter_id 无法冒充他人', spoofed.length === 0, `混入 ${spoofed.length} 条`);

    // ---------- 3. 待审批只列自己能审的 ----------
    console.log('\n[3] 待审批只列当前用户能审的单据');
    const pend = await api('GET', '/api/applications?projectId=1&status=pending&limit=200', U);
    const list = pend?.data?.applications || [];
    let notMine = 0;
    for (const a of list) {
        const ap = await api('GET', `/api/applications/${a.id}/approvals?projectId=1`, T);
        const cur = (ap.data || []).filter(x => Number(x.step_order) === Number(a.currentStep) && x.status === 'pending');
        const can = cur.some(x => Number(x.candidate_user_id) === 3 || x.candidate_role === 'user');
        if (!can) notMine++;
    }
    assert('列表中没有轮不到自己审的单据', notMine === 0, `混入 ${notMine} 条`);

    // ---------- 4. 页面标题与实际一致 ----------
    console.log('\n[4] 页面无异常');
    const writeErrs = errs.filter(e => !/^GET/.test(e));
    assert('提交过程无写请求失败', writeErrs.length === 0, writeErrs.join(' | '));

    console.log(`\n${'='.repeat(52)}`);
    console.log(`我的申请：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
