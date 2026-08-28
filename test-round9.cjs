/**
 * Round 9 修复回归测试
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
    console.log('\n=== Round 9 回归测试 ===\n');

    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.body.success);

    // --- 测试1: activity-logs 权限 ---
    console.log('\n[1] activity-logs 权限控制');
    const logGet = await request('GET', `/api/activity-logs?projectId=${PROJECT_ID}`);
    assert('GET 审计日志成功', logGet.body.success !== undefined);

    const logNoProject = await request('GET', '/api/activity-logs');
    assert('无projectId被拒', !logNoProject.body.success);

    // admin POST 应该成功
    const logPost = await request('POST', `/api/activity-logs?projectId=${PROJECT_ID}`, {
        action: 'test', target_type: 'system', description: 'Round9测试'
    });
    assert('admin POST审计日志成功', logPost.body.success);

    // --- 测试2: 405 方法校验 ---
    console.log('\n[2] 配置端点 405 方法校验');
    const endpoints = ['account-types', 'currency-types', 'subjects', 'asset-types', 'departments'];
    for (const ep of endpoints) {
        const resp = await request('PATCH', `/api/${ep}?projectId=${PROJECT_ID}`);
        assert(`PATCH /api/${ep} 返回 405`, resp.status === 405, `status=${resp.status}`);
    }

    // --- 测试3: transaction-types 只读 ---
    console.log('\n[3] transaction-types 只允许 GET');
    const ttGet = await request('GET', `/api/transaction-types?projectId=${PROJECT_ID}`);
    assert('GET transaction-types 成功', ttGet.body.success);

    const ttPost = await request('POST', `/api/transaction-types?projectId=${PROJECT_ID}`, { name: 'test' });
    assert('POST transaction-types 返回 405', ttPost.status === 405);

    const ttDelete = await request('DELETE', `/api/transaction-types/1?projectId=${PROJECT_ID}`);
    assert('DELETE transaction-types 返回 405', ttDelete.status === 405);

    // --- 测试4: 之前的回归 ---
    console.log('\n[4] 历轮回归');
    const userResp = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('用户无密码泄露', !userResp.body.data?.password);

    const noProjectSum = await request('GET', '/api/account-summary');
    assert('account-summary无projectId被拒', !noProjectSum.body.success);

    const badPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=week`);
    assert('无效period被拒', !badPeriod.body.success);

    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R9测试', account_type: '活期账户', currency_type: 'CNY', balance: 100
    });
    assert('创建账户', acct.body.success);
    if (acct.body.data?.id) {
        const income = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 50, account_id: acct.body.data.id, description: 'R9收入'
        });
        assert('收入成功', income.body.success);
        const expense = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 30, account_id: acct.body.data.id, description: 'R9支出'
        });
        assert('支出成功', expense.body.success);
        const over = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 99999, account_id: acct.body.data.id, description: '超支'
        });
        assert('超支被拒', !over.body.success);
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
