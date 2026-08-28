/**
 * Round 11 修复回归测试
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
    console.log('\n=== Round 11 回归测试 ===\n');

    // --- 测试1: 安全响应头 ---
    console.log('[1] Nginx 安全头');
    const homeResp = await request('GET', '/');
    const h = homeResp.headers;
    assert('X-Frame-Options 存在', !!h['x-frame-options'], `got: ${h['x-frame-options']}`);
    assert('X-Content-Type-Options 存在', !!h['x-content-type-options']);
    assert('X-XSS-Protection 存在', !!h['x-xss-protection']);
    assert('Referrer-Policy 存在', !!h['referrer-policy']);

    // --- 测试2: 敏感路径禁止 ---
    console.log('\n[2] 敏感路径禁止访问');
    const dotEnv = await request('GET', '/.env');
    assert('.env 被禁止', dotEnv.status === 403 || dotEnv.status === 404, `status=${dotEnv.status}`);

    const dotGit = await request('GET', '/.git/config');
    assert('.git 被禁止', dotGit.status === 403 || dotGit.status === 404, `status=${dotGit.status}`);

    const controllers = await request('GET', '/api/controllers/transactions_controller.php');
    assert('controllers 目录被禁止', controllers.status === 403 || controllers.status === 404, `status=${controllers.status}`);

    // --- 测试3: 登录和基础功能 ---
    console.log('\n[3] 基础功能回归');
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data?.token || '';
    PROJECT_ID = login.body.data?.projectId || 0;
    assert('登录成功', login.body.success);

    const userInfo = await request('GET', '/api/user');
    assert('getUserInfo 无密码', !userInfo.body.data?.password);
    assert('getUserInfo 有username', !!userInfo.body.data?.username);

    // --- 测试4: 之前修复的回归 ---
    console.log('\n[4] 历轮回归');
    const user1 = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('用户详情无密码', !user1.body.data?.password);

    const noP = await request('GET', '/api/account-summary');
    assert('无projectId被拒', !noP.body.success);

    const badPeriod = await request('GET', `/api/transaction-summary?projectId=${PROJECT_ID}&period=week`);
    assert('无效period被拒', !badPeriod.body.success);

    const patchAcct = await request('PATCH', `/api/account-types?projectId=${PROJECT_ID}`);
    assert('PATCH 405', patchAcct.status === 405);

    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: 'R11测试', account_type: '活期账户', currency_type: 'CNY', balance: 300
    });
    assert('创建账户', acct.body.success);
    if (acct.body.data?.id) {
        const inc = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 100, account_id: acct.body.data.id, description: 'R11收入'
        });
        assert('收入成功', inc.body.success);
        const exp = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 50, account_id: acct.body.data.id, description: 'R11支出'
        });
        assert('支出成功', exp.body.success);
        const over = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 99999, account_id: acct.body.data.id, description: '超支'
        });
        assert('超支被拒', !over.body.success);
    }

    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}&period=month`);
    assert('Dashboard正常', dash.body.success);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
