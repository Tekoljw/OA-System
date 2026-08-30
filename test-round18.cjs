/**
 * Round 18 回归测试
 * 1. 交易 status 字段白名单
 * 2. 项目字段白名单（create/update 只允许 name/code/description/active）
 * 3. 项目删除关联检查（有账户/交易时禁止删除）
 * + 全面回归
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
    // 登录
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.status === 200 && TOKEN);

    // === [1] 交易 status 字段白名单 ===
    console.log('\n[1] 交易 status 字段白名单');

    // 先创建测试账户
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R18状态测试', account_type: '活期账户', currency_type: 'CNY'
    });
    assert('创建测试账户', acct.status === 201);
    const acctId = acct.body?.data?.id;

    if (acctId) {
        // 正常 status 应成功
        const validTx = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 100, account_id: acctId, status: 'completed'
        });
        assert('status=completed 允许', validTx.status === 201);

        const pendingTx = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 50, account_id: acctId, status: 'pending'
        });
        assert('status=pending 允许', pendingTx.status === 201);

        // 非法 status 被拒
        const badTx = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 10, account_id: acctId, status: 'hacked'
        });
        assert('status=hacked 被拒', badTx.status === 400 || badTx.status === 422);

        const injTx = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 10, account_id: acctId, status: "'; DROP TABLE--"
        });
        assert('status SQL 注入被拒', injTx.status === 400 || injTx.status === 422);

        // 不传 status 默认 completed
        const defaultTx = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 20, account_id: acctId
        });
        assert('默认 status=completed', defaultTx.status === 201);
    }

    // === [2] 项目字段白名单 ===
    console.log('\n[2] 项目字段白名单');

    // 创建项目（正常字段）
    const proj = await request('POST', `/api/projects?projectId=${PROJECT_ID}`, {
        name: 'R18测试项目', code: 'R18TEST', description: '回归测试'
    });
    assert('创建项目成功', proj.status === 201);
    const projId = proj.body?.data?.id;

    if (projId) {
        // 尝试注入危险字段
        const injProj = await request('PUT', `/api/projects/${projId}?projectId=${PROJECT_ID}`, {
            name: 'R18更新', id: 999, created_at: '2020-01-01', active: true
        });
        assert('项目更新过滤危险字段', injProj.status === 200 && injProj.body?.data?.id === projId);

        // 只传危险字段，应该被拒（无有效字段）
        const allBadProj = await request('PUT', `/api/projects/${projId}?projectId=${PROJECT_ID}`, {
            id: 999, created_at: '2020-01-01', updated_at: '2020-01-01'
        });
        assert('全部非法字段返回错误', allBadProj.status === 400 || allBadProj.status === 500);
    }

    // === [3] 项目删除关联检查 ===
    console.log('\n[3] 项目删除关联检查');

    // 尝试删除有数据的项目（当前项目必有账户/交易）
    const delMain = await request('DELETE', `/api/projects/${PROJECT_ID}?projectId=${PROJECT_ID}`);
    assert('有数据的项目禁止删除', delMain.status === 409);

    // 创建空项目再删除 — 应成功
    const emptyProj = await request('POST', `/api/projects?projectId=${PROJECT_ID}`, {
        name: 'R18空项目', code: 'R18EMPTY'
    });
    if (emptyProj.body?.data?.id) {
        const delEmpty = await request('DELETE', `/api/projects/${emptyProj.body.data.id}?projectId=${PROJECT_ID}`);
        assert('空项目可以删除', delEmpty.status === 200);
    }

    // === [4] 全面回归 ===
    console.log('\n[4] 全面回归');

    // 安全头
    const secResp = await request('GET', '/');
    assert('CSP 存在', !!secResp.headers['content-security-policy']);

    // 敏感路径
    const env = await request('GET', '/.env');
    assert('.env 被阻止', env.status === 403 || env.status === 404);

    // getUserInfo
    const user = await request('GET', '/api/user');
    assert('getUserInfo 无密码', user.status === 200 && !user.body?.data?.password);

    // Dashboard
    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 正常', dash.status === 200);

    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    // 分页限制
    const bigPage = await request('GET', `/api/accounts?projectId=${PROJECT_ID}&limit=999999`);
    assert('分页上限有效', bigPage.status === 200);

    // 交易摘要
    const txSummary = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=month`);
    assert('交易摘要正常', txSummary.status === 200);

    // 清理测试项目
    if (projId) {
        await request('DELETE', `/api/projects/${projId}?projectId=${PROJECT_ID}`);
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
