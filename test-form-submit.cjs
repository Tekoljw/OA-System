/**
 * 表单提交端到端测试
 *
 * 补上最大的测试盲区：此前的交互扫描只「点开弹窗」从不填写提交，
 * POST /api/users 长期返回 405（用户管理的「添加用户」必然失败）就是这么藏住的。
 * 本用例真实填写并提交各创建表单，断言数据确实落库。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const http = require('http');
const { execFileSync } = require('child_process');
const { resetShareholders } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'FT' + Date.now().toString().slice(-6);   // 本轮唯一前缀，便于断言与清理
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

/** 清理历次遗留，并腾出股东比例以便测试「添加股东」 */
function resetFixtures() {
    resetShareholders();
    // 按外键依赖顺序删除：先删引用方（交易），再删被引用方（账户/股东）。
    // 此前把删账户放在最前面，撞 transactions_account_id_fkey 直接中止，
    // 后面的股东清理从未执行，导致比例被占满、后续用例连环失败。
    const sql = `
        DELETE FROM transactions WHERE project_id=1 AND account_id IN
            (SELECT id FROM accounts WHERE project_id=1 AND name LIKE 'FT%');
        DELETE FROM transactions WHERE shareholder_id IN
            (SELECT id FROM shareholders WHERE project_id=1
             AND (name LIKE 'FT%' OR name LIKE '多角色股东%'));
        DELETE FROM shareholders WHERE project_id=1
            AND (name LIKE 'FT%' OR name LIKE '多角色股东%');
        DELETE FROM accounts       WHERE project_id=1 AND name LIKE 'FT%';
        DELETE FROM subjects       WHERE project_id=1 AND name LIKE 'FT%';
        DELETE FROM asset_types    WHERE project_id=1 AND name LIKE 'FT%';
        DELETE FROM currency_types WHERE project_id=1 AND name LIKE 'FT%';
        DELETE FROM departments    WHERE project_id=1 AND name LIKE 'FT%';
        DELETE FROM user_projects  WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'ft_%');
        DELETE FROM users          WHERE username LIKE 'ft_%';`;
    try {
        execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres',
            '-d', 'oa_system', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
        console.log('  🧹 已清理测试数据');
    } catch (e) {
        // 清理失败必须完整暴露：截断的提示曾让这个问题被忽略了很久
        const detail = e.stderr ? e.stderr.toString() : e.message;
        console.log('  ⚠️ 清理失败，后续断言可能受污染影响:\n' + detail.split('\n')
            .filter(l => /ERROR|DETAIL/.test(l)).join('\n'));
    }
}

/** 选中 shadcn 下拉的第一个可选项 */
async function pickFirstOption(page, triggerText) {
    const trigger = page.locator('[role="dialog"] button', { hasText: triggerText }).first();
    if (await trigger.count() === 0) return false;
    await trigger.click();
    await page.waitForTimeout(500);
    const opt = page.locator('[role="option"]').first();
    if (await opt.count() === 0) return false;
    await opt.click();
    await page.waitForTimeout(400);
    return true;
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

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    assert('登录成功', !!token);

    // 系统会记住用户上次选择的项目，登录后不一定落在项目 1。
    // 本套件的断言都按 projectId=1 查库，所以先显式切回去。
    await api('POST', '/api/switch-project', token, { projectId: 1 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const open = async (path, btnText) => {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const b = page.locator('main button', { hasText: btnText }).first();
        if (await b.count() === 0 || !await b.isEnabled()) return false;
        await b.click();
        await page.waitForTimeout(900);
        return await page.locator('[role="dialog"]').count() > 0;
    };
    const submit = async (label) => {
        await page.locator('[role="dialog"] button', { hasText: label }).last().click();
        await page.waitForTimeout(2200);
    };

    // ---------- 1. 账户 ----------
    console.log('\n[1] 账户管理 → 新建账户');
    if (await open('/accounts', '添加账户')) {
        await page.fill('[role="dialog"] input[name="name"]', `${TAG}账户`);
        await page.fill('[role="dialog"] input[name="accountNumber"]', `${TAG}-001`);
        await page.fill('[role="dialog"] input[name="bank"]', '测试银行');
        await page.fill('[role="dialog"] input[name="limit"]', '0');
        await pickFirstOption(page, '请选择币种');
        await pickFirstOption(page, '请选择账户类型');
        await submit('确定');
        const list = await api('GET', '/api/accounts?projectId=1&limit=200', token);
        assert('账户已落库', (list.data || []).some(a => a.name === `${TAG}账户`));
    } else assert('打开新建账户弹窗', false, '按钮不可用或弹窗未打开');

    // ---------- 2. 用户（此前 POST /api/users 返回 405）----------
    console.log('\n[2] 用户管理 → 创建用户');
    if (await open('/personnel/users', '添加用户')) {
        await page.fill('[role="dialog"] input[name="username"]', `ft_${TAG.toLowerCase()}`);
        await page.fill('[role="dialog"] input[name="password"]', 'ft123456');
        await page.fill('[role="dialog"] input[name="fullName"]', `${TAG}员工`);
        await pickFirstOption(page, '选择角色');
        await pickFirstOption(page, '请选择部门');
        await submit('创建用户');
        const list = await api('GET', '/api/users?projectId=1', token);
        assert('用户已落库', (list.data || []).some(u => u.username === `ft_${TAG.toLowerCase()}`));
    } else assert('打开创建用户弹窗', false);

    // ---------- 3. 部门 ----------
    console.log('\n[3] 部门配置 → 添加部门');
    if (await open('/personnel/departments', '添加')) {
        await page.fill('[role="dialog"] input#name', `${TAG}部门`);
        await submit('添加');
        const list = await api('GET', '/api/departments?projectId=1', token);
        assert('部门已落库', (list.data || []).some(d => d.name === `${TAG}部门`));
    } else assert('打开添加部门弹窗', false);

    // ---------- 4. 科目 ----------
    console.log('\n[4] 科目分类 → 添加科目');
    if (await open('/configurations/subject-categories', '添加')) {
        await page.fill('[role="dialog"] input#name', `${TAG}科目`);
        await submit('添加');
        const list = await api('GET', '/api/subjects?projectId=1', token);
        assert('科目已落库', (list.data || []).some(s => s.name === `${TAG}科目`));
    } else assert('打开添加科目弹窗', false);

    // ---------- 5. 资产分类 ----------
    console.log('\n[5] 资产分类 → 添加分类');
    if (await open('/configurations/asset-categories', '添加')) {
        await page.fill('[role="dialog"] input#name', `${TAG}资产类`);
        await page.fill('[role="dialog"] input#depreciationRate', '10');
        await submit('添加');
        const list = await api('GET', '/api/asset-types?projectId=1', token);
        assert('资产分类已落库', (list.data || []).some(t => t.name === `${TAG}资产类`));
    } else assert('打开添加资产分类弹窗', false);

    // ---------- 6. 股东 ----------
    console.log('\n[6] 股东管理 → 添加股东（比例已腾空）');
    if (await open('/shareholders', '添加股东')) {
        const inputs = page.locator('[role="dialog"] input');
        await inputs.nth(0).fill(`${TAG}股东`);
        const n = await inputs.count();
        for (let i = 1; i < n; i++) {
            if (await inputs.nth(i).getAttribute('type') === 'number') { await inputs.nth(i).fill('30'); break; }
        }
        await submit('添加');
        const list = await api('GET', '/api/shareholders?projectId=1', token);
        assert('股东已落库', (list.data || []).some(s => s.name === `${TAG}股东`));
    } else assert('打开添加股东弹窗', false, '按钮可能因比例占满而禁用');

    // ---------- 汇总 ----------
    const writeErrs = errs.filter(e => !/^GET/.test(e));
    console.log(`\n提交过程中的写请求错误: ${writeErrs.length ? writeErrs.join(' | ') : '无'}`);
    assert('提交过程无写请求失败', writeErrs.length === 0, writeErrs.join(' | '));

    // 用完即清：本用例会占用股东比例，不清理会让多角色测试因比例超 100% 失败
    resetFixtures();

    console.log(`\n${'='.repeat(50)}`);
    console.log(`表单提交：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(50));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
