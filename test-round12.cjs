/**
 * Round 12 修复回归测试
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
    console.log('\n=== Round 12 回归测试 ===\n');

    // --- 测试1: CSP 头 ---
    console.log('[1] Content-Security-Policy');
    const homeResp = await request('GET', '/');
    assert('CSP 头存在', !!homeResp.headers['content-security-policy']);
    assert('X-Frame-Options 存在', !!homeResp.headers['x-frame-options']);

    // --- 测试2: 请求体大小限制 ---
    console.log('\n[2] 请求体大小限制');
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data?.token || '';
    PROJECT_ID = login.body.data?.projectId || 0;
    assert('正常登录成功', login.body.success);

    // 发送大 payload（但不超过 nginx 限制，只测试 JsonMiddleware 逻辑）
    const normalBody = { type: 'income', amount: 100, description: 'x'.repeat(1000) };
    const normalReq = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, normalBody);
    // 无 account_id 会报验证错误，但不是 413，说明正常处理了
    assert('正常大小请求通过', normalReq.status !== 413);

    // --- 测试3: 敏感路径 ---
    console.log('\n[3] 敏感路径防护');
    const dotEnv = await request('GET', '/.env');
    assert('.env 被禁止', dotEnv.status === 403 || dotEnv.status === 404);
    const dotGit = await request('GET', '/.git/config');
    assert('.git 被禁止', dotGit.status === 403 || dotGit.status === 404);

    // --- 测试4: 全面回归 ---
    console.log('\n[4] 全面回归');
    const userInfo = await request('GET', '/api/user');
    assert('getUserInfo 安全', !userInfo.body.data?.password && !!userInfo.body.data?.username);

    const user1 = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('用户详情无密码', !user1.body.data?.password);

    const noP = await request('GET', '/api/account-summary');
    assert('无projectId被拒', !noP.body.success);

    const badPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=week`);
    assert('无效period被拒', !badPeriod.body.success);

    const huge = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 9999999999, description: '超大金额'
    });
    assert('超大金额被拒', !huge.body.success);

    const patchAcct = await request('PATCH', `/api/account-types?projectId=${PROJECT_ID}`);
    assert('PATCH 405', patchAcct.status === 405);

    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R12测试', account_type: '活期账户', currency_type: 'CNY', balance: 500
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

    const changePwd = await request('POST', '/api/change-password', {
        oldPassword: 'wrong', newPassword: 'test123'
    });
    assert('错误旧密码被拒', !changePwd.body.success);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
