/**
 * Round 8 修复回归测试
 */
const http = require('http');
const BASE = 'http://localhost:8000';
let TOKEN = '', PROJECT_ID = 0;
let passed = 0, failed = 0;

function request(method, path, body = null, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            method, hostname: url.hostname, port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' },
        };
        if (TOKEN && !extraHeaders['Authorization']) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
        Object.assign(opts.headers, extraHeaders);
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers, raw: data }); }
                catch { resolve({ status: res.statusCode, body: data, headers: res.headers, raw: data }); }
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
    console.log('\n=== Round 8 回归测试 ===\n');

    // --- 测试1: JWT 无硬编码后备密钥 ---
    console.log('[1] JWT 环境变量必须设置');
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    assert('正常登录成功（JWT_SECRET已设置）', login.body.success);
    TOKEN = login.body.data?.token || '';
    PROJECT_ID = login.body.data?.projectId || 0;

    // 用伪造的token尝试访问
    const fakeToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsIm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcyNDgzNTIwMCwiZXhwIjoxOTI0OTIxNjAwfQ.FAKESIGNATURE';
    const fakeResp = await request('GET', `/api/users?projectId=${PROJECT_ID}`, null, { 'Authorization': `Bearer ${fakeToken}` });
    assert('伪造token被拒绝', fakeResp.status === 401, `status=${fakeResp.status}, body=${JSON.stringify(fakeResp.body).substring(0,100)}`);

    // --- 测试2: CORS 不含 PATCH ---
    console.log('\n[2] CORS 方法白名单');
    const optionsResp = await request('OPTIONS', '/api/health');
    const allowMethods = optionsResp.headers['access-control-allow-methods'] || '';
    assert('CORS方法不含PATCH', !allowMethods.includes('PATCH'), `got: ${allowMethods}`);
    assert('CORS方法含GET/POST/PUT/DELETE',
        allowMethods.includes('GET') && allowMethods.includes('POST') &&
        allowMethods.includes('PUT') && allowMethods.includes('DELETE'));

    // --- 测试3: Round 7 回归 ---
    console.log('\n[3] Round 7 回归验证');
    const noProject = await request('GET', '/api/account-summary');
    assert('无projectId被拒', !noProject.body.success);

    const badPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=week`);
    assert('无效period被拒', !badPeriod.body.success);

    const hugeAmt = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 9999999999, description: '超大金额'
    });
    assert('超大金额被拒', !hugeAmt.body.success);

    // --- 测试4: Round 6 回归 ---
    console.log('\n[4] Round 6 回归验证');
    const userResp = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('用户无密码泄露', !userResp.body.data?.password);
    assert('用户有username', !!userResp.body.data?.username);

    const wrongPwd = await request('POST', '/api/change-password', {
        oldPassword: 'wrong', newPassword: 'newpass123'
    });
    assert('错误旧密码被拒', !wrongPwd.body.success);

    // --- 测试5: 正常业务流程 ---
    console.log('\n[5] 正常业务流程完整性');
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R8测试账户', account_type: '活期账户', currency_type: 'CNY', balance: 500
    });
    assert('创建账户成功', acct.body.success);
    const acctId = acct.body.data?.id;

    if (acctId) {
        const income = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 200, account_id: acctId, description: '收入测试'
        });
        assert('收入交易成功', income.body.success);

        const expense = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 100, account_id: acctId, description: '支出测试'
        });
        assert('支出交易成功', expense.body.success);

        const overSpend = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 99999, account_id: acctId, description: '超支测试'
        });
        assert('超支被拒', !overSpend.body.success);
    }

    const dashboard = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}&period=month`);
    assert('Dashboard获取成功', dashboard.body.success);

    const summary = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=year`);
    assert('年度交易摘要成功', summary.body.success);

    // --- 汇总 ---
    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
