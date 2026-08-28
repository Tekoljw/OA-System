/**
 * Round 13 修复回归测试
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
                try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
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
    console.log('\n=== Round 13 回归测试 ===\n');

    // --- 测试1: 初始化脚本禁止直接访问 ---
    console.log('[1] 初始化脚本禁止访问');
    const dbInit = await request('GET', '/api/db_init.php');
    assert('db_init.php 被禁止', dbInit.status === 403 || dbInit.status === 404, `status=${dbInit.status}`);

    const initUsers = await request('GET', '/api/init_test_users.php');
    assert('init_test_users.php 被禁止', initUsers.status === 403 || initUsers.status === 404, `status=${initUsers.status}`);

    const usersPhp = await request('GET', '/api/users.php');
    assert('users.php 被禁止', usersPhp.status === 403 || usersPhp.status === 404, `status=${usersPhp.status}`);

    // --- 测试2: 登录限流（纯用户名维度） ---
    console.log('\n[2] 登录限流');
    // 正常登录应该成功
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data?.token || '';
    PROJECT_ID = login.body.data?.projectId || 0;
    assert('正常登录成功', login.body.success);

    // 错误密码应该失败（不是被锁定）
    const wrongPwd = await request('POST', '/api/login', { username: 'admin', password: 'wrong123' });
    assert('错误密码登录失败', !wrongPwd.body.success);

    // 正确密码仍能登录（未被锁定）
    const loginAgain = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    assert('正确密码仍可登录', loginAgain.body.success);
    TOKEN = loginAgain.body.data?.token || TOKEN;

    // --- 测试3: 安全头 ---
    console.log('\n[3] 安全头');
    const homeResp = await request('GET', '/');
    assert('CSP 头存在', !!homeResp.headers['content-security-policy']);
    assert('X-Frame-Options 存在', !!homeResp.headers['x-frame-options']);

    // --- 测试4: 全面回归 ---
    console.log('\n[4] 全面回归');
    const userInfo = await request('GET', '/api/user');
    assert('getUserInfo 安全', !userInfo.body.data?.password && !!userInfo.body.data?.username);

    const noP = await request('GET', '/api/account-summary');
    assert('无projectId被拒', !noP.body.success);

    const badPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=week`);
    assert('无效period被拒', !badPeriod.body.success);

    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R13测试', account_type: '活期账户', currency_type: 'CNY', balance: 500
    });
    assert('创建账户', acct.body.success);
    if (acct.body.data?.id) {
        const inc = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 200, account_id: acct.body.data.id, description: '收入'
        });
        assert('收入成功', inc.body.success);
        const exp = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 100, account_id: acct.body.data.id, description: '支出'
        });
        assert('支出成功', exp.body.success);
        const over = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 99999, account_id: acct.body.data.id, description: '超支'
        });
        assert('超支被拒', !over.body.success);
    }

    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}&period=month`);
    assert('Dashboard正常', dash.body.success);

    const dotEnv = await request('GET', '/.env');
    assert('.env 被禁止', dotEnv.status === 403 || dotEnv.status === 404);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
