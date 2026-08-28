/**
 * Round 10 修复回归测试
 */
const http = require('http');
const BASE = 'http://localhost:8000';
let TOKEN = '', PROJECT_ID = 0;
let passed = 0, failed = 0;

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            method, hostname: url.hostname, port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' },
        };
        if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

async function run() {
    console.log('\n=== Round 10 回归测试 ===\n');

    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.body.success);

    // --- 测试1: getUserInfo 不泄露密码 ---
    console.log('\n[1] getUserInfo 安全性');
    const userInfo = await request('GET', '/api/user');
    assert('GET /api/user 成功', userInfo.body.success);
    assert('用户信息无password字段', !userInfo.body.data?.password);
    assert('用户信息有username', !!userInfo.body.data?.username);

    // --- 测试2: 跨项目删除用户防护 ---
    console.log('\n[2] 跨项目删除用户防护');
    // 尝试删除一个不存在于当前项目的用户ID（用大数）
    const delResp = await request('DELETE', `/api/users/99999?projectId=${PROJECT_ID}`);
    assert('删除不存在的项目用户被拒', delResp.status === 403, `status=${delResp.status}`);

    // users PATCH 应返回 405
    const patchUser = await request('PATCH', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('PATCH /api/users 返回 405', patchUser.status === 405);

    // --- 测试3: 全面回归 ---
    console.log('\n[3] 全面回归');
    // 密码安全
    const user1 = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('GET users/{id} 无密码', !user1.body.data?.password);

    // projectId 校验
    const noP = await request('GET', '/api/account-summary');
    assert('account-summary无projectId被拒', !noP.body.success);

    // period 白名单
    const badP = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=week`);
    assert('无效period被拒', !badP.body.success);

    // 金额上限
    const huge = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 9999999999, description: '超大金额'
    });
    assert('超大金额被拒', !huge.body.success);

    // 405 方法校验
    const patchAcct = await request('PATCH', `/api/account-types?projectId=${PROJECT_ID}`);
    assert('PATCH account-types 405', patchAcct.status === 405);

    // 审计日志权限
    const logNoP = await request('GET', '/api/activity-logs');
    assert('审计日志无projectId被拒', !logNoP.body.success);

    // 交易完整流程
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R10测试', account_type: '活期账户', currency_type: 'CNY', balance: 200
    });
    assert('创建账户', acct.body.success);
    if (acct.body.data?.id) {
        const inc = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 100, account_id: acct.body.data.id, description: '收入'
        });
        assert('收入成功', inc.body.success);
        const exp = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 50, account_id: acct.body.data.id, description: '支出'
        });
        assert('支出成功', exp.body.success);
        const over = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 99999, account_id: acct.body.data.id, description: '超支'
        });
        assert('超支被拒', !over.body.success);
    }

    // Dashboard
    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}&period=month`);
    assert('Dashboard正常', dash.body.success);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
