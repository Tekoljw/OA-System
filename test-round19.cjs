/**
 * Round 19 回归测试
 * 1. createTransaction 禁止 type=transfer（必须走 createTransfer 接口）
 * 2. 划款同账户严格比较
 * 3. 前端 token 兜底值已移除（间接验证 API）
 * 4. 全面回归
 */
const http = require('http');

const BASE = 'http://localhost:8000';
let TOKEN = '';
let PROJECT_ID = 0;
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

function request(method, path, body = null, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = {
            hostname: url.hostname, port: url.port, path: url.pathname + url.search,
            method, headers: { 'Content-Type': 'application/json', ...extraHeaders }
        };
        if (TOKEN && !extraHeaders['Authorization']) {
            opts.headers['Authorization'] = `Bearer ${TOKEN}`;
        }
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.status === 200 && TOKEN);

    // 创建测试账户
    const acct1 = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R19测试账户A', account_type: '活期账户', currency_type: 'CNY'
    });
    assert('创建测试账户A', acct1.status === 201);
    const acctId1 = acct1.body?.data?.id;

    const acct2 = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R19测试账户B', account_type: '活期账户', currency_type: 'CNY'
    });
    assert('创建测试账户B', acct2.status === 201);
    const acctId2 = acct2.body?.data?.id;

    // === [1] createTransaction 禁止 type=transfer ===
    console.log('\n[1] createTransaction 禁止 type=transfer');

    const phantomTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'transfer', amount: 100, account_id: acctId1
    });
    assert('type=transfer 被 createTransaction 拒绝', phantomTx.status === 400 || phantomTx.status === 422);
    const errMsg = phantomTx.body?.error?.message || phantomTx.body?.message || '';
    assert('错误消息包含限制说明', errMsg.includes('划款') || errMsg.includes('专用') || errMsg.includes('转入') || errMsg.includes('仅支持'));

    // income/expense 仍然正常
    const incomeTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 500, account_id: acctId1
    });
    assert('type=income 仍正常', incomeTx.status === 201);

    const expenseTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'expense', amount: 10, account_id: acctId1
    });
    assert('type=expense 仍正常', expenseTx.status === 201);

    // === [2] 划款同账户严格比较 ===
    console.log('\n[2] 划款同账户严格比较');

    if (acctId1) {
        // 同账户划款应被拒
        const selfTransfer = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'transfer', account_id: acctId1, target_account_id: acctId1, amount: 10
        });
        assert('同账户划款被拒', selfTransfer.status === 400 || selfTransfer.status === 422);

        // 字符串/数字类型混用也应被拒
        const selfTransfer2 = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'transfer', account_id: String(acctId1), target_account_id: acctId1, amount: 10
        });
        assert('字符串/数字混用同账户被拒', selfTransfer2.status === 400 || selfTransfer2.status === 422);
    }

    // 正常跨账户划款应成功（先充值，走 type=transfer）
    if (acctId1 && acctId2) {
        await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 1000, account_id: acctId1
        });
        const transfer = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'transfer', account_id: acctId1, target_account_id: acctId2, amount: 50
        });
        assert('正常跨账户划款成功', transfer.status === 201);
    }

    // === [3] Token 安全验证 ===
    console.log('\n[3] Token 安全验证');

    // token "1" 不应能访问
    const badToken = await request('GET', `/api/user`, null, { 'Authorization': 'Bearer 1' });
    assert('token "1" 被拒绝', badToken.status === 401);

    // 随机无效 token 被拒
    const fakeToken = await request('GET', `/api/user`, null, { 'Authorization': 'Bearer fake_invalid_token_xyz' });
    assert('无效 token 被拒绝', fakeToken.status === 401);

    // === [4] 全面回归 ===
    console.log('\n[4] 全面回归');

    const secResp = await request('GET', '/');
    assert('CSP 存在', !!secResp.headers['content-security-policy']);

    const env = await request('GET', '/.env');
    assert('.env 被阻止', env.status === 403 || env.status === 404);

    const user = await request('GET', '/api/user');
    assert('getUserInfo 无密码', user.status === 200 && !user.body?.data?.password);

    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 正常', dash.status === 200);

    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    // 交易 status 白名单仍有效
    const badStatus = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 1, account_id: acctId1, status: 'evil'
    });
    assert('status 白名单仍有效', badStatus.status === 400 || badStatus.status === 422);

    // 项目删除关联检查仍有效
    const delMain = await request('DELETE', `/api/projects/${PROJECT_ID}?projectId=${PROJECT_ID}`);
    assert('项目删除关联检查仍有效', delMain.status === 409);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
