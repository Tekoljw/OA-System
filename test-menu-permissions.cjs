/**
 * 菜单权限可见性
 *
 * 权限落地后，菜单也应按权限显示 —— 此前普通用户能看到「配置管理」
 * 「人员管理」等入口，点进去才 403。
 *
 * 同时确认一件事：隐藏只是显示层。直接输网址仍能打开页面，
 * 但页面上的写操作会被服务端拒绝 —— 这是有意为之，
 * 前端可见性不能当作安全边界。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const http = require('http');
const { psql } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'MP' + Date.now().toString().slice(-6);
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
        DELETE FROM user_projects WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'mp_%');
        DELETE FROM users WHERE username LIKE 'mp_%';
        DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code LIKE 'mp%');
        DELETE FROM roles WHERE code LIKE 'mp%';`, '菜单权限清理');
    console.log('  🧹 已清理测试角色与用户');
}

/** 登录并展开所有父菜单，返回可见菜单文本 */
async function menuOf(browser, user, pw) {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', user);
    await page.fill('input[placeholder*="密码"]', pw);
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(3000);
    for (const t of ['流水管理', '资产管理', '流程管理', '配置管理', '人员管理']) {
        const b = page.locator('aside button, nav button').filter({ hasText: t }).first();
        if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(250); }
    }
    const nav = await page.locator('aside, nav').first().innerText().catch(() => '');
    return { page, text: nav };
}

(async () => {
    resetFixtures();
    const login = await api('POST', '/api/login', '', { username: 'admin', password: 'admin123' });
    const T = login?.data?.token;
    assert('管理员登录', !!T);

    // ---------- 1. 登录接口下发权限 ----------
    console.log('\n[1] 权限随登录下发');
    assert('登录返回 permissions', Array.isArray(login?.data?.permissions), typeof login?.data?.permissions);
    assert('管理员 12 项', login?.data?.permissions?.length === 12, `${login?.data?.permissions?.length} 项`);

    const me = await api('GET', '/api/user', T);
    assert('/api/user 也返回 permissions', Array.isArray(me?.data?.permissions));

    const ul = await api('POST', '/api/login', '', { username: 'testuser', password: 'user123' });
    assert('普通用户 5 项', ul?.data?.permissions?.length === 5, `${ul?.data?.permissions?.length} 项`);

    const browser = await chromium.launch({ headless: true });

    // ---------- 2. 管理员看到全部菜单 ----------
    console.log('\n[2] 管理员菜单');
    const a = await menuOf(browser, 'admin', 'admin123');
    for (const m of ['财务仪表盘', '账户管理', '出入金记录', '待审批', '配置管理', '审批规则', '人员管理', '权限管理', '股东管理']) {
        assert(`可见「${m}」`, a.text.includes(m));
    }
    assert('底部显示真实用户名而非硬编码', a.text.includes('系统管理员'), a.text.slice(-40));
    await a.page.close();

    // ---------- 3. 普通用户菜单收敛 ----------
    console.log('\n[3] 普通用户菜单');
    const u = await menuOf(browser, 'testuser', 'user123');
    for (const m of ['财务仪表盘', '账户管理', '出入金记录', '资产记录', '我的申请']) {
        assert(`可见「${m}」`, u.text.includes(m));
    }
    for (const m of ['配置管理', '人员管理', '权限管理', '用户管理', '股东管理', '待审批', '待归帐', '待执行']) {
        assert(`不可见「${m}」`, !u.text.includes(m));
    }
    assert('底部显示测试普通用户', u.text.includes('测试普通用户'));
    await u.page.close();

    // ---------- 4. 自定义角色按配置显示 ----------
    console.log('\n[4] 自定义角色的菜单随权限变化');
    const role = await api('POST', '/api/roles?projectId=1', T, {
        code: `mp_${TAG.toLowerCase()}`, name: `${TAG}审批员`,
        permissions: ['view_dashboard', 'manage_pending_approvals'],
    });
    assert('创建审批员角色', role.status === 201);
    await api('POST', '/api/users?projectId=1', T, {
        username: `mp_${TAG.toLowerCase()}`, password: 'mp123456', fullName: '审批员', role: 'user',
    });
    psql(`UPDATE users SET role='mp_${TAG.toLowerCase()}',
              role_id=(SELECT id FROM roles WHERE code='mp_${TAG.toLowerCase()}')
          WHERE username='mp_${TAG.toLowerCase()}';`, '绑定角色');

    const r = await menuOf(browser, `mp_${TAG.toLowerCase()}`, 'mp123456');
    assert('可见「待审批」（已授权）', r.text.includes('待审批'));
    assert('不可见「我的申请」（未授权）', !r.text.includes('我的申请'));
    assert('不可见「账户管理」（未授权）', !r.text.includes('账户管理'));
    assert('不可见「配置管理」（未授权）', !r.text.includes('配置管理'));

    // ---------- 5. 隐藏不等于拦截 ----------
    console.log('\n[5] 前端隐藏只是显示层，服务端仍独立校验');
    await r.page.goto(`${BASE}/personnel/users`, { waitUntil: 'networkidle' });
    await r.page.waitForTimeout(1500);
    assert('直接输网址仍可打开页面', !r.page.url().includes('/login'), r.page.url());

    const token = await r.page.evaluate(() => localStorage.getItem('token'));
    const blocked = await api('POST', '/api/users?projectId=1', token, {
        username: 'mp_should_fail', password: 'x1234567',
    });
    assert('但服务端拒绝其写操作(403)', blocked.status === 403, `实际 ${blocked.status}`);
    await r.page.close();

    console.log(`\n${'='.repeat(52)}`);
    console.log(`菜单权限：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    await browser.close();
    resetFixtures();
    process.exit(failed > 0 ? 1 : 0);
})();
