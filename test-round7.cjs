/**
 * Round 7 修复回归测试
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
    console.log('\n=== Round 7 回归测试 ===\n');

    // 登录
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.body.success);

    // --- 测试1: projectId=0 被拒绝 ---
    console.log('\n[1] 跨项目数据泄露防护');
    const noProject1 = await request('GET', '/api/account-summary');
    assert('account-summary无projectId被拒', !noProject1.body.success);

    const noProject2 = await request('GET', '/api/transaction-summary');
    assert('transaction-summary无projectId被拒', !noProject2.body.success);

    const noProject3 = await request('GET', '/api/dashboard-data');
    assert('dashboard-data无projectId被拒', !noProject3.body.success);

    // 正常带projectId可以访问
    const withProject = await request('GET', `/api/account-summary?projectId=${PROJECT_ID}`);
    assert('带projectId的account-summary成功', withProject.body.success);

    // --- 测试2: 金额上限验证 ---
    console.log('\n[2] 金额范围验证');
    const hugeAmt = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 9999999999, description: '超大金额测试'
    });
    assert('超大金额被拒绝', !hugeAmt.body.success, JSON.stringify(hugeAmt.body.error));

    const infAmt = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 'Infinity', description: 'Infinity测试'
    });
    assert('Infinity金额被拒绝', !infAmt.body.success);

    // 正常金额可以通过
    const normalAcct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R7测试账户', account_type: '活期账户', currency_type: 'CNY', balance: 0
    });
    const acctId = normalAcct.body.data?.id;
    const normalAmt = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 100.50, account_id: acctId, description: '正常金额'
    });
    assert('正常金额交易成功', normalAmt.body.success);

    // --- 测试3: period 白名单 ---
    console.log('\n[3] period 参数白名单');
    const badPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=custom`);
    assert('无效period被拒绝', !badPeriod.body.success);

    const goodPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=month`);
    assert('month period正常', goodPeriod.body.success);

    const yearPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=year`);
    assert('year period正常', yearPeriod.body.success);

    // --- 测试4: JSON XSS 安全编码 ---
    console.log('\n[4] JSON输出安全编码');
    const xssAcct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: '<script>alert("xss")</script>', account_type: '活期账户', currency_type: 'CNY', balance: 0
    });
    // 检查响应中的 < 是否被编码为 \u003C
    const rawResp = await new Promise((resolve, reject) => {
        const url = new URL(`/api/accounts/${xssAcct.body.data?.id}?projectId=${PROJECT_ID}`, BASE);
        const req = http.request({
            method: 'GET', hostname: url.hostname, port: url.port,
            path: url.pathname + url.search,
            headers: { 'Authorization': `Bearer ${TOKEN}` },
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.end();
    });
    assert('JSON中<被编码', !rawResp.includes('<script>'), rawResp.substring(0, 100));

    // --- 测试5: Round 6 回归 ---
    console.log('\n[5] Round 6 回归验证');
    const userResp = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('用户接口无密码泄露', !userResp.body.data?.password);

    const changePwd = await request('POST', '/api/change-password', {
        oldPassword: 'wrong', newPassword: 'test123'
    });
    assert('错误旧密码被拒', !changePwd.body.success);

    const overSpend = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
        type: 'expense', amount: 999999, account_id: acctId, description: '超支测试'
    });
    assert('超额支出被拒绝', !overSpend.body.success);

    // --- 汇总 ---
    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
