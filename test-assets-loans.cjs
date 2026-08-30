/**
 * 资产记录 / 借贷记录 / 用户创建 端到端测试
 * 这三处此前均为占位或缺失：assets、loans 返回空数据，POST /api/users 直接 405
 * （用户管理页的「添加用户」按钮点了必然失败，页面级扫描发现不了）。
 */
const http = require('http');
const { execFileSync } = require('child_process');
const BASE = 'http://localhost:8000';
let passed = 0, failed = 0;

const assert = (n, c, d = '') => c ? (passed++, console.log(`  ✅ ${n}`))
                                   : (failed++, console.log(`  ❌ ${n} ${d}`));
function request(method, path, body = null, token = '') {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search,
                       method, headers: { 'Content-Type': 'application/json' } };
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        const req = http.request(opts, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
                                  catch { resolve({ status: res.statusCode, body: d }); } });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}
const msg = r => r.body?.error?.message || r.body?.message || '';
const P = 1;

/** 自清理，保证可重复运行 */
function resetFixtures() {
    try {
        execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres',
            '-d', 'oa_system', '-c',
            `DELETE FROM asset_depreciations WHERE project_id = 1;
             DELETE FROM assets            WHERE project_id = 1;
             DELETE FROM loan_settlements  WHERE project_id = 1;
             DELETE FROM loans             WHERE project_id = 1;
             DELETE FROM user_projects WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'uitest%');
             DELETE FROM users WHERE username LIKE 'uitest%';`
        ], { stdio: 'pipe' });
        console.log('  🧹 已清理上轮测试数据');
    } catch (e) { console.log('  ⚠️ 清理失败:', String(e.message).slice(0, 80)); }
}

async function run() {
    resetFixtures();
    const a = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    const u = await request('POST', '/api/login', { username: 'testuser', password: 'user123' });
    const ADMIN = a.body?.data?.token, USER = u.body?.data?.token;
    assert('管理员登录', !!ADMIN);
    assert('普通用户登录', !!USER);

    // ---------- 资产 ----------
    console.log('\n[1] 资产记录');
    const create = await request('POST', `/api/assets?projectId=${P}`, {
        name: '测试笔记本', quantity: 10, unitPrice: 6000, assetTypeId: 1, departmentId: 1,
    }, ADMIN);
    assert('创建资产', create.status === 201, `-> ${msg(create)}`);
    const aid = create.body?.data?.id;
    assert('总值自动算为 60000', Number(create.body?.data?.total_price) === 60000);
    assert('剩余价值初始等于总值', Number(create.body?.data?.remaining_value) === 60000);
    assert('返回分类名供前端展示', create.body?.data?.asset_type_name);

    const dep = await request('POST', `/api/assets/${aid}/depreciate?projectId=${P}`,
        { quantity: 2, amount: 12000, description: '两台报废' }, ADMIN);
    assert('核销 12000', dep.status === 200, `-> ${msg(dep)}`);
    assert('剩余价值递减为 48000', Number(dep.body?.data?.remaining_value) === 48000);
    assert('状态转为核销中', dep.body?.data?.status === 'depreciating');
    assert('核销明细已留痕', (dep.body?.data?.depreciation_records || []).length === 1);

    const over = await request('POST', `/api/assets/${aid}/depreciate?projectId=${P}`, { amount: 999999 }, ADMIN);
    assert('超额核销被拒', over.status >= 400 && /超过剩余价值/.test(msg(over)), `-> ${msg(over)}`);

    const shrink = await request('PUT', `/api/assets/${aid}?projectId=${P}`, { quantity: 1, unitPrice: 100 }, ADMIN);
    assert('新总值低于已核销金额时被拒', shrink.status >= 400 && /已核销/.test(msg(shrink)), `-> ${msg(shrink)}`);

    const userCreate = await request('POST', `/api/assets?projectId=${P}`, { name: '越权资产', quantity: 1, unitPrice: 1 }, USER);
    assert('普通用户不能建资产(403)', userCreate.status === 403, `实际 ${userCreate.status}`);

    // 核销到零应转为已核销
    await request('POST', `/api/assets/${aid}/depreciate?projectId=${P}`, { amount: 48000 }, ADMIN);
    const done = await request('GET', `/api/assets/${aid}?projectId=${P}`, null, ADMIN);
    assert('核销至零后状态为已核销', done.body?.data?.status === 'written_off', `实际 ${done.body?.data?.status}`);

    // ---------- 借贷 ----------
    console.log('\n[2] 借贷记录');
    const loan = await request('POST', `/api/loans?projectId=${P}`, {
        type: '应收款', amount: 50000, borrower: '某客户', description: '季度货款', departmentId: 1,
    }, ADMIN);
    assert('创建借贷记录', loan.status === 201, `-> ${msg(loan)}`);
    const lid = loan.body?.data?.id;
    assert('方向按类型推导为借出', loan.body?.data?.direction === '借出', `实际 ${loan.body?.data?.direction}`);
    assert('未结金额初始等于金额', Number(loan.body?.data?.remainingAmount) === 50000);
    assert('操作时间不含微秒', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(loan.body?.data?.operationTime || ''),
           loan.body?.data?.operationTime);

    const settle = await request('POST', `/api/loans/${lid}/settle?projectId=${P}`,
        { amount: 20000, description: '首期回款' }, ADMIN);
    assert('结算 20000', settle.status === 200, `-> ${msg(settle)}`);
    assert('未结递减为 30000', Number(settle.body?.data?.remainingAmount) === 30000);
    assert('结算明细已留痕', (settle.body?.data?.settlements || []).length === 1);

    const overSettle = await request('POST', `/api/loans/${lid}/settle?projectId=${P}`, { amount: 99999 }, ADMIN);
    assert('超额结算被拒', overSettle.status >= 400 && /超过未结金额/.test(msg(overSettle)), `-> ${msg(overSettle)}`);

    await request('POST', `/api/loans/${lid}/settle?projectId=${P}`, { amount: 30000 }, ADMIN);
    const settled = await request('GET', `/api/loans/${lid}?projectId=${P}`, null, ADMIN);
    assert('结清后状态为已完成', settled.body?.data?.status === '已完成', `实际 ${settled.body?.data?.status}`);

    const badType = await request('POST', `/api/loans?projectId=${P}`, { type: '不存在的类型', amount: 1 }, ADMIN);
    assert('非法借贷类型被拒', badType.status >= 400);

    // ---------- 用户创建 ----------
    console.log('\n[3] 用户创建（此前 POST /api/users 直接 405）');
    const nu = await request('POST', `/api/users?projectId=${P}`, {
        username: 'uitest_staff', password: 'staff123', fullName: '测试员工', role: 'user',
    }, ADMIN);
    assert('管理员创建用户', nu.status === 201, `-> ${msg(nu)}`);

    const login = await request('POST', '/api/login', { username: 'uitest_staff', password: 'staff123' });
    assert('新用户可用该密码登录（哈希正确）', login.status === 200 && login.body?.data?.token, `-> ${msg(login)}`);

    const dup = await request('POST', `/api/users?projectId=${P}`, { username: 'uitest_staff', password: 'x123456' }, ADMIN);
    assert('重名被拒', dup.status >= 400 && /已存在/.test(msg(dup)), `-> ${msg(dup)}`);

    const shortPw = await request('POST', `/api/users?projectId=${P}`, { username: 'uitest_b', password: '123' }, ADMIN);
    assert('短密码被拒', shortPw.status >= 400);

    const badRole = await request('POST', `/api/users?projectId=${P}`, { username: 'uitest_c', password: 'x123456', role: 'superadmin' }, ADMIN);
    assert('非法角色被拒', badRole.status >= 400);

    const userAdd = await request('POST', `/api/users?projectId=${P}`, { username: 'uitest_d', password: 'x123456' }, USER);
    assert('普通用户不能建用户(403)', userAdd.status === 403, `实际 ${userAdd.status}`);

    // ---------- 隔离 ----------
    console.log('\n[4] 越权与项目隔离');
    assert('无 token 取资产 401', (await request('GET', `/api/assets?projectId=${P}`)).status === 401);
    assert('非成员项目取资产 403', (await request('GET', `/api/assets?projectId=99`, null, USER)).status === 403);
    assert('非成员项目取借贷 403', (await request('GET', `/api/loans?projectId=99`, null, USER)).status === 403);

    console.log(`\n${'='.repeat(52)}`);
    console.log(`资产/借贷/用户创建：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('测试异常:', e); process.exit(1); });
