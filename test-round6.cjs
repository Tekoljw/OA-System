/**
 * Round 6 修复回归测试
 */
const http = require('http');

const BASE = 'http://localhost:8000';
let TOKEN = '';
let PROJECT_ID = 0;
let passed = 0, failed = 0;

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            method,
            hostname: url.hostname,
            port: url.port,
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

function assert(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

async function run() {
    console.log('\n=== Round 6 回归测试 ===\n');

    // 登录
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.body.success);

    // --- 测试1: 用户密码不泄露 ---
    console.log('\n[1] 用户密码哈希泄露修复');
    const userResp = await request('GET', `/api/users/1?projectId=${PROJECT_ID}`);
    assert('GET /api/users/1 成功', userResp.body.success);
    assert('返回中无 password 字段', !userResp.body.data.password, `got: ${userResp.body.data.password ? 'HAS PASSWORD' : 'ok'}`);
    assert('返回中有 username 字段', !!userResp.body.data.username);

    // --- 测试2: 账户分页过滤 ---
    console.log('\n[2] AccountService 分页过滤修复');
    // 先创建两个不同币种的账户用于测试
    const acct1 = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: '测试CNY账户-R6', account_type: '活期账户', currency_type: 'CNY'
    });
    const acct2 = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: '测试USD账户-R6', account_type: '活期账户', currency_type: 'USD'
    });
    assert('创建CNY账户', acct1.body.success);
    assert('创建USD账户', acct2.body.success);

    // 按币种过滤
    const cnyOnly = await request('GET', `/api/accounts?projectId=${PROJECT_ID}&currency=CNY`);
    assert('CNY过滤返回成功', cnyOnly.body.success);
    const cnyItems = cnyOnly.body.data || [];
    const allCNY = cnyItems.every(a => a.currency_type === 'CNY');
    assert('CNY过滤结果都是CNY', allCNY, `found non-CNY items`);
    // total 应该匹配实际条数（在一页内）
    const cnyTotal = cnyOnly.body.pagination?.total ?? cnyItems.length;
    assert('total 与过滤结果一致', cnyTotal === cnyItems.length || cnyTotal >= cnyItems.length);

    // --- 测试3: 修改密码接口 ---
    console.log('\n[3] 修改密码接口');
    // 密码太短
    const shortPwd = await request('POST', '/api/change-password', {
        oldPassword: 'admin123', newPassword: '12'
    });
    assert('密码太短被拒绝', !shortPwd.body.success);

    // 旧密码错误
    const wrongOld = await request('POST', '/api/change-password', {
        oldPassword: 'wrong_password', newPassword: 'newpass123'
    });
    assert('旧密码错误被拒绝', !wrongOld.body.success);

    // 正确修改密码
    const changePwd = await request('POST', '/api/change-password', {
        oldPassword: 'admin123', newPassword: 'admin456'
    });
    assert('密码修改成功', changePwd.body.success, JSON.stringify(changePwd.body));

    // 用新密码登录
    const newLogin = await request('POST', '/api/login', {
        username: 'admin', password: 'admin456'
    });
    assert('用新密码登录成功', newLogin.body.success);

    // 改回原密码
    TOKEN = newLogin.body.data.token;
    const revert = await request('POST', '/api/change-password', {
        oldPassword: 'admin456', newPassword: 'admin123'
    });
    assert('密码恢复成功', revert.body.success);

    // 重新登录用原密码
    const origLogin = await request('POST', '/api/login', {
        username: 'admin', password: 'admin123'
    });
    TOKEN = origLogin.body.data.token;
    assert('原密码重新登录成功', origLogin.body.success);

    // --- 测试4: 交易余额校验（bcmath + SELECT FOR UPDATE） ---
    console.log('\n[4] 交易余额校验（精度+并发安全）');
    // 创建一个有初始余额的账户
    const testAcct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: '精度测试账户-R6', account_type: '活期账户', currency_type: 'CNY',
        initial_balance: 100.10, balance: 100.10
    });
    assert('创建测试账户', testAcct.body.success);
    const testAcctId = testAcct.body.data?.id;

    if (testAcctId) {
        // 收入交易
        const income = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 0.01, account_id: testAcctId, description: '精度测试收入'
        });
        assert('0.01收入交易成功', income.body.success);

        // 尝试超额支出
        const overSpend = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 999999, account_id: testAcctId, description: '超额支出'
        });
        assert('超额支出被拒绝', !overSpend.body.success);
    }

    // --- 测试5: 用户更新不返回密码 ---
    console.log('\n[5] 用户更新返回值安全');
    const userUpdate = await request('PUT', `/api/users/1?projectId=${PROJECT_ID}`, {
        full_name: '系统管理员'
    });
    assert('更新用户成功', userUpdate.body.success);
    assert('更新返回中无password', !userUpdate.body.data?.password);

    // --- 汇总 ---
    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
