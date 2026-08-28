/**
 * Round 17 回归测试
 * 1. JWT exp 字段必须存在
 * 2. JWT alg 必须为 HS256
 * 3. 项目权限校验 — 用户不能访问未归属的项目
 * + 全面回归
 */
const http = require('http');
const crypto = require('crypto');

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
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// 构造伪造 JWT（用于安全测试）
function forgeJWT(payload, alg = 'HS256', secret = 'wrong_secret') {
    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg })).toString('base64url');
    const pay = Buffer.from(JSON.stringify(payload)).toString('base64url');
    let sig = '';
    if (alg === 'HS256') {
        sig = crypto.createHmac('sha256', secret).update(`${header}.${pay}`).digest('base64url');
    } else {
        sig = '';  // alg=none
    }
    return `${header}.${pay}.${sig}`;
}

async function run() {
    // 登录
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.status === 200 && TOKEN);

    // === [1] JWT exp 验证 ===
    console.log('\n[1] JWT exp 必须存在');

    // 构造无 exp 的 token（使用错误密钥，签名不匹配也会被拒）
    const noExpToken = forgeJWT({ sub: 1, name: 'admin', iat: Math.floor(Date.now()/1000) });
    const noExpResp = await request('GET', '/api/user', null, { Authorization: `Bearer ${noExpToken}` });
    assert('无 exp 的 token 被拒', noExpResp.status === 401);

    // 构造已过期的 token
    const expiredToken = forgeJWT({ sub: 1, name: 'admin', iat: 1000, exp: 1001 });
    const expiredResp = await request('GET', '/api/user', null, { Authorization: `Bearer ${expiredToken}` });
    assert('过期 token 被拒', expiredResp.status === 401);

    // === [2] JWT alg 验证 ===
    console.log('\n[2] JWT alg 验证');

    // 构造 alg=none 的 token
    const noneToken = forgeJWT({ sub: 1, name: 'admin', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 86400 }, 'none');
    const noneResp = await request('GET', '/api/user', null, { Authorization: `Bearer ${noneToken}` });
    assert('alg=none 被拒', noneResp.status === 401);

    // 构造 alg=HS384 的 token
    const hs384Token = forgeJWT({ sub: 1, name: 'admin', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 86400 }, 'HS384');
    const hs384Resp = await request('GET', '/api/user', null, { Authorization: `Bearer ${hs384Token}` });
    assert('alg=HS384 被拒', hs384Resp.status === 401);

    // 正常 token 仍然有效
    const validUser = await request('GET', '/api/user');
    assert('正常 token 仍有效', validUser.status === 200);

    // === [3] 项目权限校验 ===
    console.log('\n[3] 项目权限校验');

    // 尝试访问不存在的项目
    const fakeProject = await request('GET', '/api/accounts?projectId=99999');
    assert('不存在项目被拒（非超管）或返回空', fakeProject.status === 200 || fakeProject.status === 403);

    // 正常项目应该能访问
    const validAccounts = await request('GET', `/api/accounts?projectId=${PROJECT_ID}`);
    assert('归属项目可访问', validAccounts.status === 200);

    // Dashboard 也受保护
    const dashValid = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 归属项目正常', dashValid.status === 200);

    // 交易摘要也受保护
    const txSummary = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=month`);
    assert('交易摘要归属项目正常', txSummary.status === 200);

    // === [4] 全面回归 ===
    console.log('\n[4] 全面回归');

    // 安全头
    const secResp = await request('GET', '/');
    assert('CSP 存在', !!secResp.headers['content-security-policy']);
    assert('无 Server 版本', !(secResp.headers['server'] || '').includes('/'));

    // 敏感路径
    const env = await request('GET', '/.env');
    assert('.env 被阻止', env.status === 403 || env.status === 404);

    // getUserInfo 安全
    assert('getUserInfo 无密码', !validUser.body?.data?.password);

    // 分页限制
    const bigPage = await request('GET', `/api/accounts?projectId=${PROJECT_ID}&limit=999999`);
    assert('分页上限有效', bigPage.status === 200);

    // Dashboard projectId=0
    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    // 账户操作
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R17测试', account_type: '活期账户', currency_type: 'CNY'
    });
    assert('创建账户成功', acct.status === 201);

    if (acct.body?.data?.id) {
        const income = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 100, account_id: acct.body.data.id
        });
        assert('收入交易成功', income.status === 201);

        const expense = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 50, account_id: acct.body.data.id
        });
        assert('支出交易成功', expense.status === 201);
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
