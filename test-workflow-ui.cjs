/**
 * 审批工作流界面操作端到端测试
 *
 * 收支现在只能由审批流产生，这四个页面是唯一入口。
 * 此前只做过页面加载扫描，从未验证过界面上的实际操作：
 * 点「立即审批」、填意见、归账选账户、执行落账。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const http = require('http');
const { psql } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'WF' + Date.now().toString().slice(-6);
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
            (SELECT id FROM applications WHERE project_id=1 AND title LIKE 'WF%');
        DELETE FROM applications WHERE project_id=1 AND title LIKE 'WF%';`, '工作流清理');
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
    const ctxOf = () => browser.newContext({ viewport: { width: 1440, height: 900 } });

    // ---- 准备一条申请：金额取小额档，尽量只需主管一级 ----
    const adminPage = await (await ctxOf()).newPage();
    const T = await login(adminPage, 'admin', 'admin123');
    assert('管理员登录', !!T);

    const accs = await api('GET', '/api/accounts?projectId=1&limit=200', T);
    const acc = (accs.data || []).find(a => a.currency_type === 'CNY' && parseFloat(a.balance) > 5000);
    const subs = await api('GET', '/api/subjects?projectId=1', T);
    const sub = (subs.data || []).find(s => s.type === 'expense' && !String(s.code).startsWith('expense-div'));
    assert('取到账户与科目', !!acc && !!sub);

    const app = await api('POST', '/api/applications?projectId=1', T, {
        type: 'expense', title: `${TAG}界面审批`, amount: 120, departmentId: 1,
        description: '界面操作验证',
    });
    assert('提交申请单', app.status === 201, app?.error?.message || '');
    const appId = app?.data?.id;

    // ---- 1. 待审批页：界面上完成审批 ----
    console.log('\n[1] 待审批页：点「立即审批」并通过');
    const mgrPage = await (await ctxOf()).newPage();
    const mgrErrs = [];
    mgrPage.on('pageerror', e => mgrErrs.push(String(e).slice(0, 120)));
    await login(mgrPage, 'testuser', 'user123');
    await mgrPage.goto(`${BASE}/workflows/pending-approvals`, { waitUntil: 'networkidle' });
    await mgrPage.waitForTimeout(1500);

    const row = mgrPage.locator('tbody tr', { hasText: `${TAG}界面审批` }).first();
    assert('申请出现在待审批列表', await row.count() === 1);
    if (await row.count()) {
        await row.locator('button', { hasText: '立即审批' }).click();
        await mgrPage.waitForTimeout(1000);
        const dlg = mgrPage.locator('[role="dialog"]').first();
        assert('审批弹窗打开', await dlg.count() === 1);
        await dlg.locator('textarea').fill('界面测试通过');
        await dlg.locator('button', { hasText: '通过' }).click();
        await mgrPage.waitForTimeout(2500);

        // 多级审批链下，主管通过后整单仍为 pending（等待管理员会签），
        // 因此不能用整单状态判断，要看该审批节点是否已记为通过。
        const appr = await api('GET', `/api/applications/${appId}/approvals?projectId=1`, T);
        const step1 = (appr.data || []).filter(x => Number(x.step_order) === 1);
        assert('界面审批已记入第1级', step1.some(x => x.status === 'approved'),
               JSON.stringify(step1.map(x => x.status)));
        assert('审批人记录为操作者本人', step1.some(x => Number(x.approver_id) === 3),
               JSON.stringify(step1.map(x => x.approver_id)));
    }

    // 若还需管理员会签，用接口补完（界面部分已验证）
    for (const [u, pw] of [['admin', 'admin123'], ['phpuser', 'php123']]) {
        const cur = await api('GET', `/api/applications/${appId}?projectId=1`, T);
        if (cur?.data?.status !== 'pending') break;
        const l = await api('POST', '/api/login', '', { username: u, password: pw });
        await api('PUT', `/api/applications/${appId}/status?projectId=1`, l?.data?.token, { status: 'approved' });
    }
    const allocReady = await api('GET', `/api/applications/${appId}?projectId=1`, T);
    assert('全部审批通过后进入待归账', allocReady?.data?.status === 'to_be_allocated',
           `实际 ${allocReady?.data?.status}`);

    // ---- 2. 待归账页：界面上完成归账 ----
    console.log('\n[2] 待归账页：选账户并归账');
    await adminPage.goto(`${BASE}/workflows/pending-accounting`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1500);

    const heads = await adminPage.locator('thead th').allInnerTexts();
    assert('待归账表格有「操作」列', heads.some(h => h.includes('操作')), JSON.stringify(heads));

    const aRow = adminPage.locator('tbody tr', { hasText: `${TAG}界面审批` }).first();
    assert('申请出现在待归账列表', await aRow.count() === 1);
    const rowText = await aRow.innerText().catch(() => '');
    assert('状态显示为待归账而非待审批', /待归账/.test(rowText), rowText.replace(/\n/g, ' | ').slice(0, 120));

    if (await aRow.count()) {
        await aRow.locator('button', { hasText: '归账' }).click();
        await adminPage.waitForTimeout(1200);
        const dlg = adminPage.locator('[role="dialog"]').first();
        assert('归账弹窗打开', await dlg.count() === 1);

        await dlg.locator('button', { hasText: '请选择账户' }).click();
        await adminPage.waitForTimeout(600);
        await adminPage.locator('[role="option"]').first().click();
        await adminPage.waitForTimeout(400);
        await dlg.locator('button', { hasText: '请选择科目' }).click();
        await adminPage.waitForTimeout(600);
        await adminPage.locator('[role="option"]').first().click();
        await adminPage.waitForTimeout(400);
        await dlg.locator('button', { hasText: '确认归账' }).click();
        await adminPage.waitForTimeout(2500);

        const after = await api('GET', `/api/applications/${appId}?projectId=1`, T);
        assert('归账后转入待执行', after?.data?.status === 'to_be_executed', `实际 ${after?.data?.status}`);
    }

    // ---- 3. 待执行页：界面上执行落账 ----
    console.log('\n[3] 待执行页：执行并核对余额');
    const balOf = async (id) => {
        const r = await api('GET', '/api/accounts?projectId=1&limit=200', T);
        const a = (r.data || []).find(x => x.id === id);
        return a ? parseFloat(a.balance) : null;
    };
    const detail = await api('GET', `/api/applications/${appId}?projectId=1`, T);
    const allocatedAcc = detail?.data?.allocatedAccountId
        ?? (await api('GET', `/api/applications/${appId}?projectId=1`, T))?.data?.allocatedAccountId;

    await adminPage.goto(`${BASE}/workflows/pending-execution`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1500);

    const eHeads = await adminPage.locator('thead th').allInnerTexts();
    assert('待执行表格有「操作」列', eHeads.some(h => h.includes('操作')), JSON.stringify(eHeads));

    const eRow = adminPage.locator('tbody tr', { hasText: `${TAG}界面审批` }).first();
    assert('申请出现在待执行列表', await eRow.count() === 1);

    if (await eRow.count()) {
        // 记录执行前该申请归账账户的余额
        const before = allocatedAcc ? await balOf(allocatedAcc) : null;
        await eRow.locator('button', { hasText: '执行' }).click();
        await adminPage.waitForTimeout(3000);

        const after = await api('GET', `/api/applications/${appId}?projectId=1`, T);
        assert('执行后状态为已完成', after?.data?.status === 'completed', `实际 ${after?.data?.status}`);

        if (allocatedAcc && before !== null) {
            const nowBal = await balOf(allocatedAcc);
            assert('账户余额按支出扣减 120', Math.abs((before - 120) - nowBal) < 0.01,
                   `前 ${before} 后 ${nowBal}`);
        }
        const tx = await api('GET', `/api/transactions?projectId=1&limit=50`, T);
        assert('已生成对应流水', (tx.data || []).some(t => String(t.description || '').includes(`申请单#${appId}`)));
    }

    assert('审批页无未捕获异常', mgrErrs.length === 0, mgrErrs.join(' | '));

    console.log(`\n${'='.repeat(52)}`);
    console.log(`审批工作流界面：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
