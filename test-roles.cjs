/**
 * 角色与权限管理
 *
 * 此前「新增角色」只写 localStorage、从不调接口，界面却提示创建成功；
 * 那 12 个权限勾选项后端也完全没使用，权限判断一律是 role === 'admin'。
 * 本用例验证角色可配置，且配置出来的权限真的生效。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const http = require('http');
const { psql } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'RL' + Date.now().toString().slice(-6);
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
const msg = r => r?.error?.message || r?.message || '';

function resetFixtures() {
    psql(`
        DELETE FROM user_projects WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'rl_%');
        DELETE FROM users WHERE username LIKE 'rl_%';
        DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE is_system = FALSE);
        DELETE FROM roles WHERE is_system = FALSE;
        DELETE FROM subjects WHERE project_id=1 AND name LIKE 'RL%';`, '角色测试清理');
    console.log('  🧹 已清理测试角色与用户');
}

(async () => {
    resetFixtures();
    const login = await api('POST', '/api/login', '', { username: 'admin', password: 'admin123' });
    const T = login?.data?.token;
    assert('管理员登录', !!T);

    // ---------- 1. 内置角色 ----------
    console.log('\n[1] 内置角色');
    const list = await api('GET', '/api/roles?projectId=1', T);
    const roles = list.data || [];
    const adminRole = roles.find(r => r.code === 'admin');
    const userRole  = roles.find(r => r.code === 'user');
    assert('管理员角色存在且权限齐全', adminRole && adminRole.permissions.length === 13,
           `${adminRole?.permissions?.length} 项`);
    assert('普通用户角色维持 5 项', userRole && userRole.permissions.length === 5,
           `${userRole?.permissions?.length} 项`);
    assert('内置角色标记为系统角色', adminRole?.isSystem === true && userRole?.isSystem === true);
    assert('返回该角色下的用户数', typeof adminRole?.userCount === 'number' && adminRole.userCount > 0,
           `userCount=${adminRole?.userCount}`);

    const perms = await api('GET', '/api/roles/permissions?projectId=1', T);
    assert('权限项由后端提供', Array.isArray(perms.data) && perms.data.length === 13,
           `${perms.data?.length} 项`);

    // ---------- 2. 增删改 ----------
    console.log('\n[2] 自定义角色增删改');
    const created = await api('POST', '/api/roles?projectId=1', T, {
        code: `${TAG.toLowerCase()}`, name: `${TAG}财务专员`,
        description: '只读加提申请',
        permissions: ['view_dashboard', 'view_accounts', 'manage_my_applications'],
    });
    assert('创建自定义角色', created.status === 201, `-> ${msg(created)}`);
    const rid = created?.data?.id;
    assert('权限已保存', created?.data?.permissions?.length === 3);
    assert('非系统角色', created?.data?.isSystem === false);

    const updated = await api('PUT', `/api/roles/${rid}?projectId=1`, T, {
        name: `${TAG}财务主办`, description: '改名并调整权限',
        permissions: ['view_dashboard', 'manage_configurations'],
    });
    assert('更新角色', updated.status === 200, `-> ${msg(updated)}`);
    assert('权限已替换而非追加', updated?.data?.permissions?.length === 2,
           JSON.stringify(updated?.data?.permissions));
    assert('名称已更新', updated?.data?.name === `${TAG}财务主办`);

    // ---------- 3. 校验与保护 ----------
    console.log('\n[3] 校验与保护');
    const badPerm = await api('POST', '/api/roles?projectId=1', T, {
        name: '非法角色', permissions: ['hack_everything'],
    });
    assert('未知权限项被拒', badPerm.status >= 400 && /未知的权限项/.test(msg(badPerm)), `-> ${msg(badPerm)}`);

    const noName = await api('POST', '/api/roles?projectId=1', T, { name: '', permissions: [] });
    assert('空名称被拒', noName.status >= 400);

    const dupCode = await api('POST', '/api/roles?projectId=1', T, {
        code: `${TAG.toLowerCase()}`, name: '重复标识', permissions: [],
    });
    assert('重复标识被拒', dupCode.status >= 400 && /已存在/.test(msg(dupCode)), `-> ${msg(dupCode)}`);

    const delSys = await api('DELETE', `/api/roles/${adminRole.id}?projectId=1`, T);
    assert('内置角色不可删除', delSys.status >= 400 && /内置/.test(msg(delSys)), `-> ${msg(delSys)}`);

    // 管理员角色的权限不可被削减，否则会把自己锁在权限页外
    const weaken = await api('PUT', `/api/roles/${adminRole.id}?projectId=1`, T, {
        name: '管理员', permissions: ['view_dashboard'],
    });
    assert('管理员权限不可削减', weaken?.data?.permissions?.length === 13,
           `实际 ${weaken?.data?.permissions?.length} 项`);

    // ---------- 4. 权限真的生效 ----------
    console.log('\n[4] 配置出来的权限真的生效');
    // 造一个只有配置管理权限的角色与用户
    const cfgRole = await api('POST', '/api/roles?projectId=1', T, {
        code: `${TAG.toLowerCase()}_cfg`, name: `${TAG}配置员`,
        permissions: ['view_dashboard', 'manage_configurations'],
    });
    assert('创建配置员角色', cfgRole.status === 201, `-> ${msg(cfgRole)}`);

    const nu = await api('POST', '/api/users?projectId=1', T, {
        username: `rl_${TAG.toLowerCase()}`, password: 'rl123456', fullName: '配置员', role: 'user',
    });
    assert('创建测试用户', nu.status === 201, `-> ${msg(nu)}`);
    psql(`UPDATE users SET role='${TAG.toLowerCase()}_cfg',
              role_id=(SELECT id FROM roles WHERE code='${TAG.toLowerCase()}_cfg')
          WHERE username='rl_${TAG.toLowerCase()}';`, '绑定角色');

    const cl = await api('POST', '/api/login', '', { username: `rl_${TAG.toLowerCase()}`, password: 'rl123456' });
    const C = cl?.data?.token;
    assert('配置员登录', !!C, `-> ${msg(cl)}`);

    const canCfg = await api('POST', '/api/subjects?projectId=1', C, { name: `${TAG}科目`, type: 'income', transaction_type_code: 'other_income' });
    assert('有 manage_configurations → 可建科目', canCfg.status === 201, `实际 ${canCfg.status} ${msg(canCfg)}`);

    for (const [label, path, body] of [
        ['manage_personnel → 不可建用户', '/api/users?projectId=1', { username: 'rl_x', password: 'x1234567' }],
        ['manage_personnel → 不可建部门', '/api/departments?projectId=1', { name: `${TAG}越权部门` }],
        ['manage_assets → 不可建资产', '/api/assets?projectId=1', { name: `${TAG}越权资产`, quantity: 1, unitPrice: 1 }],
    ]) {
        const r = await api('POST', path, C, body);
        assert(`无 ${label}`, r.status === 403, `实际 ${r.status}`);
    }

    // ---------- 5. 界面操作 ----------
    console.log('\n[5] 界面新增角色并落库');
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 120)));

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/personnel/permissions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const rowsBefore = await page.locator('tbody tr').count();

    await page.locator('main button', { hasText: '新增角色' }).click();
    await page.waitForTimeout(1200);
    const dlg = page.locator('[role="dialog"]').first();
    await dlg.locator('input[name="name"]').fill(`${TAG}界面角色`);
    const switches = dlg.locator('[role="switch"]');
    assert('弹窗展示 13 个权限项', await switches.count() === 13, `${await switches.count()} 个`);
    await switches.nth(0).click(); await page.waitForTimeout(200);
    await switches.nth(3).click(); await page.waitForTimeout(200);
    await dlg.locator('button', { hasText: '创建角色' }).click();
    await page.waitForTimeout(2500);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    assert('刷新后仍在（真正落库）',
           (await page.evaluate(() => document.body.innerText)).includes(`${TAG}界面角色`));
    assert('列表新增一行', await page.locator('tbody tr').count() === rowsBefore + 1,
           `前 ${rowsBefore} 后 ${await page.locator('tbody tr').count()}`);

    const after = await api('GET', '/api/roles?projectId=1', T);
    const uiRole = (after.data || []).find(r => r.name === `${TAG}界面角色`);
    assert('勾选的权限已保存', uiRole && uiRole.permissions.length === 2,
           JSON.stringify(uiRole?.permissions));
    assert('界面无未捕获异常', errs.length === 0, errs.join(' | '));

    // ---------- 6. 删除保护 ----------
    console.log('\n[6] 角色下有用户时不可删除');
    const cfgRoleId = cfgRole?.data?.id;
    const delInUse = await api('DELETE', `/api/roles/${cfgRoleId}?projectId=1`, T);
    assert('有用户占用时拒绝删除', delInUse.status >= 400 && /用户/.test(msg(delInUse)), `-> ${msg(delInUse)}`);

    const delFree = await api('DELETE', `/api/roles/${rid}?projectId=1`, T);
    assert('无用户占用可删除', delFree.status === 200, `-> ${msg(delFree)}`);

    console.log(`\n${'='.repeat(52)}`);
    console.log(`角色与权限：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
