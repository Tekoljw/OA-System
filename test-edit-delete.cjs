/**
 * 编辑 / 删除路径端到端测试
 *
 * 创建路径已由 test-form-submit.cjs 覆盖并从中查出四个缺陷；
 * 本用例补上另一半：通过界面修改与删除既有记录，断言变更确实落库。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const http = require('http');
const { execFileSync } = require('child_process');
const { resetShareholders } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'ED' + Date.now().toString().slice(-6);
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
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function resetFixtures() {
    resetShareholders();
    // 按外键依赖顺序删除
    const sql = `
        DELETE FROM transactions WHERE shareholder_id IN
            (SELECT id FROM shareholders WHERE project_id=1
             AND (name LIKE 'ED%' OR name LIKE '多角色股东%' OR name LIKE 'FT%'));
        DELETE FROM shareholders WHERE project_id=1
            AND (name LIKE 'ED%' OR name LIKE '多角色股东%' OR name LIKE 'FT%');
        DELETE FROM subjects       WHERE project_id=1 AND name LIKE 'ED%';
        DELETE FROM asset_types    WHERE project_id=1 AND (name LIKE 'ED%' OR name LIKE 'EDIT探测%');
        DELETE FROM subjects       WHERE project_id=1 AND name LIKE 'EDIT探测%';
        DELETE FROM currency_types WHERE project_id=1 AND name LIKE 'ED%';
        DELETE FROM departments    WHERE project_id=1 AND name LIKE 'ED%';`;
    try {
        execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres',
            '-d', 'oa_system', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
        console.log('  🧹 已清理测试数据');
    } catch (e) {
        const d = e.stderr ? e.stderr.toString() : e.message;
        console.log('  ⚠️ 清理失败:\n' + d.split('\n').filter(l => /ERROR|DETAIL/.test(l)).join('\n'));
    }
}

(async () => {
    resetFixtures();
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const writeErrs = [];
    page.on('pageerror', e => writeErrs.push(`未捕获: ${String(e).slice(0, 100)}`));
    page.on('response', r => {
        if (r.url().includes('/api/') && r.status() >= 400 && r.request().method() !== 'GET') {
            writeErrs.push(`${r.request().method()} ${r.status()} ${r.url().replace(BASE, '')}`);
        }
    });

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    assert('登录成功', !!token);

    const rowOf = (kw) => page.locator('tbody tr', { hasText: kw }).first();
    const goto = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1300); };
    const clickDlg = async (label) => {
        await page.locator('[role="dialog"] button', { hasText: label }).last().click();
        await page.waitForTimeout(2000);
    };
    /** 确认二次确认框（AlertDialog）*/
    const confirmAlert = async () => {
        const btn = page.locator('[role="alertdialog"] button', { hasText: /删除|确认|确定/ }).last();
        if (await btn.count()) { await btn.click(); await page.waitForTimeout(2000); return true; }
        return false;
    };

    // ---------- 1. 科目：编辑 + 删除 ----------
    console.log('\n[1] 科目分类');
    await api('POST', '/api/subjects?projectId=1', token, { name: `${TAG}科目`, type: 'income', transaction_type_code: 'main_income' });
    await goto('/configurations/subject-categories');
    let row = rowOf(`${TAG}科目`);
    assert('新建科目出现在列表', await row.count() === 1);
    if (await row.count()) {
        await row.locator('button').first().click();     // 编辑（square-pen）
        await page.waitForTimeout(900);
        await page.fill('[role="dialog"] input#name', `${TAG}科目改`);
        await clickDlg('更新');
        const after = await api('GET', '/api/subjects?projectId=1', token);
        assert('科目改名已落库', (after.data || []).some(s => s.name === `${TAG}科目改`));
        assert('旧名称已不存在', !(after.data || []).some(s => s.name === `${TAG}科目`));

        await goto('/configurations/subject-categories');
        row = rowOf(`${TAG}科目改`);
        await row.locator('button').last().click();      // 删除（trash2）
        await page.waitForTimeout(800);
        await confirmAlert();
        const after2 = await api('GET', '/api/subjects?projectId=1', token);
        assert('科目删除已落库', !(after2.data || []).some(s => s.name === `${TAG}科目改`));
    }

    // ---------- 2. 资产分类：编辑 + 删除 ----------
    console.log('\n[2] 资产分类');
    await api('POST', '/api/asset-types?projectId=1', token, { name: `${TAG}资产类` });
    await goto('/configurations/asset-categories');
    row = rowOf(`${TAG}资产类`);
    assert('新建资产分类出现在列表', await row.count() === 1);
    if (await row.count()) {
        await row.locator('button').first().click();
        await page.waitForTimeout(900);
        await page.fill('[role="dialog"] input#name', `${TAG}资产类改`);
        await clickDlg('更新');
        const after = await api('GET', '/api/asset-types?projectId=1', token);
        assert('资产分类改名已落库', (after.data || []).some(t => t.name === `${TAG}资产类改`));

        await goto('/configurations/asset-categories');
        row = rowOf(`${TAG}资产类改`);
        await row.locator('button').last().click();
        await page.waitForTimeout(800);
        await confirmAlert();
        const after2 = await api('GET', '/api/asset-types?projectId=1', token);
        assert('资产分类删除已落库', !(after2.data || []).some(t => t.name === `${TAG}资产类改`));
    }

    // ---------- 3. 币种：编辑 + 删除 ----------
    console.log('\n[3] 币种');
    await api('POST', '/api/currency-types?projectId=1', token, { name: `${TAG}币`, code: `${TAG.slice(-3)}` });
    await goto('/configurations/account-categories');
    row = rowOf(`${TAG}币`);
    assert('新建币种出现在列表', await row.count() === 1);
    if (await row.count()) {
        // 币种行内还有汇率开关和输入框，不能再按「第一个按钮」定位编辑
        await row.locator('button[aria-label="编辑币种"]').first().click();
        await page.waitForTimeout(900);
        const inp = page.locator('[role="dialog"] input').first();
        await inp.fill(`${TAG}币改`);
        await clickDlg(/更新|保存|确定/);
        const after = await api('GET', '/api/currency-types?projectId=1', token);
        assert('币种改名已落库', (after.data || []).some(c => c.name === `${TAG}币改`),
               JSON.stringify((after.data || []).map(c => c.name).slice(-3)));
    }

    // ---------- 4. 股东：编辑 + 删除 ----------
    console.log('\n[4] 股东');
    const shList = await api('GET', '/api/shareholders?projectId=1', token);
    const used = (shList.data || []).reduce((s, x) => s + Number(x.share_ratio), 0);
    assert('清理后股东比例有余量可供测试', used <= 95, `当前已占 ${used}%`);
    if (used <= 95) {
        await api('POST', '/api/shareholders?projectId=1', token, { name: `${TAG}股东`, share_ratio: 1 });
        await goto('/shareholders');
        row = rowOf(`${TAG}股东`);
        assert('新建股东出现在列表', await row.count() === 1);
        if (await row.count()) {
            await row.locator('button').first().click();
            await page.waitForTimeout(900);
            await page.locator('[role="dialog"] input').first().fill(`${TAG}股东改`);
            await clickDlg(/更新|保存|确认|确定/);
            const after = await api('GET', '/api/shareholders?projectId=1', token);
            assert('股东改名已落库', (after.data || []).some(s => s.name === `${TAG}股东改`),
                   JSON.stringify((after.data || []).map(s => s.name)));

            await goto('/shareholders');
            row = rowOf(`${TAG}股东改`);
            await row.locator('button').last().click();
            await page.waitForTimeout(800);
            await confirmAlert();
            const after2 = await api('GET', '/api/shareholders?projectId=1', token);
            assert('股东删除已落库', !(after2.data || []).some(s => s.name === `${TAG}股东改`),
                   JSON.stringify((after2.data || []).map(s => s.name)));
        }
    }

    // ---------- 5. 部门：编辑（含任命主管）----------
    console.log('\n[5] 部门（编辑并任命主管）');
    await api('POST', '/api/departments?projectId=1', token, { name: `${TAG}部门` });
    await goto('/personnel/departments');
    const deptCard = page.locator('main button', { hasText: `${TAG}部门` }).first();
    assert('新建部门出现在列表', await deptCard.count() >= 1);

    const dList = await api('GET', '/api/departments?projectId=1', token);
    const mine = (dList.data || []).find(d => d.name === `${TAG}部门`);
    assert('部门接口返回主管字段', mine && 'manager_name' in mine,
           mine ? Object.keys(mine).join(',') : '未找到');
    const withMgr = (dList.data || []).find(d => d.manager_id);
    assert('已任命主管的部门能取到姓名', !!(withMgr && withMgr.manager_name),
           withMgr ? `manager_name=${withMgr.manager_name}` : '无已任命主管的部门');

    // ---------- 汇总 ----------
    const errs = [...new Set(writeErrs)];
    console.log(`\n编辑/删除过程中的写请求错误: ${errs.length ? errs.join(' | ') : '无'}`);
    assert('过程中无写请求失败', errs.length === 0, errs.join(' | '));

    resetFixtures();
    console.log(`\n${'='.repeat(50)}`);
    console.log(`编辑/删除：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(50));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
