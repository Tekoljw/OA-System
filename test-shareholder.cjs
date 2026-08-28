/**
 * 股东管理功能测试
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

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = {
            hostname: url.hostname, port: url.port, path: url.pathname + url.search,
            method, headers: { 'Content-Type': 'application/json' }
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

    // === [1] 股东 CRUD ===
    console.log('\n[1] 股东 CRUD');

    // 创建股东 A
    const shA = await request('POST', `/api/shareholders?projectId=${PROJECT_ID}`, {
        name: '测试股东A', share_ratio: 60, contact: '13800001111'
    });
    assert('创建股东A (60%)', shA.status === 201 && shA.body?.data?.name === '测试股东A');
    const shAId = shA.body?.data?.id;

    // 创建股东 B
    const shB = await request('POST', `/api/shareholders?projectId=${PROJECT_ID}`, {
        name: '测试股东B', share_ratio: 40
    });
    assert('创建股东B (40%)', shB.status === 201);
    const shBId = shB.body?.data?.id;

    // 比例已满 100%，再添加应失败
    const shC = await request('POST', `/api/shareholders?projectId=${PROJECT_ID}`, {
        name: '测试股东C', share_ratio: 1
    });
    assert('比例超 100% 被拒', shC.status === 400 || shC.status === 422);

    // 获取列表
    const list = await request('GET', `/api/shareholders?projectId=${PROJECT_ID}`);
    assert('获取股东列表', list.status === 200 && Array.isArray(list.body?.data));
    const shareholderCount = list.body.data.filter(s => s.name.startsWith('测试股东')).length;
    assert('列表包含 2 个测试股东', shareholderCount >= 2);

    // 更新股东
    const updated = await request('PUT', `/api/shareholders/${shAId}?projectId=${PROJECT_ID}`, {
        name: '测试股东A-改', share_ratio: 55
    });
    assert('更新股东成功', updated.status === 200 && updated.body?.data?.name === '测试股东A-改');

    // 更新后 B 可以调高到 45%
    const updB = await request('PUT', `/api/shareholders/${shBId}?projectId=${PROJECT_ID}`, {
        share_ratio: 45
    });
    assert('B 调高到 45%', updB.status === 200);

    // === [2] 股东入资交易 ===
    console.log('\n[2] 股东入资交易');

    // 创建测试账户
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}`, {
        name: '股东测试账户', account_type: '活期账户', currency_type: 'CNY'
    });
    const acctId = acct.body?.data?.id;
    assert('创建测试账户', acct.status === 201 && acctId);

    // 获取股东入资科目 ID
    const subjects = await request('GET', `/api/subjects?projectId=${PROJECT_ID}`);
    const incomeSubject = (subjects.body?.data || []).find(s => s.code === 'income-shareholder');
    assert('股东入资科目存在', !!incomeSubject);
    const dividendSubject = (subjects.body?.data || []).find(s => s.code === 'expense-dividend');
    assert('股东分红科目存在', !!dividendSubject);

    if (incomeSubject && acctId && shAId) {
        // 股东A入资
        const txA = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 55000, account_id: acctId,
            subject_id: incomeSubject.id, shareholder_id: shAId,
            description: '测试股东A入资'
        });
        assert('股东A入资成功', txA.status === 201);

        // 股东B入资
        const txB = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 45000, account_id: acctId,
            subject_id: incomeSubject.id, shareholder_id: shBId,
            description: '测试股东B入资'
        });
        assert('股东B入资成功', txB.status === 201);

        // 入资不带 shareholder_id 应失败
        const txNoSh = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 1000, account_id: acctId,
            subject_id: incomeSubject.id
        });
        assert('入资不选股东被拒', txNoSh.status === 400 || txNoSh.status === 422);
    }

    // === [3] 入资分析 ===
    console.log('\n[3] 入资分析');

    const contrib = await request('GET', `/api/shareholders?action=contribution-summary&projectId=${PROJECT_ID}`);
    assert('入资汇总返回成功', contrib.status === 200 && contrib.body?.data?.shareholders);
    if (contrib.body?.data?.shareholders) {
        const total = contrib.body.data.total_contribution;
        assert('入资总额 >= 100000', total >= 100000);
        const aRow = contrib.body.data.shareholders.find(r => r.id === shAId);
        if (aRow) {
            assert('股东A入资额正确', aRow.total_contribution >= 55000);
            // A 按 55% 比例应入 55000，实际入 55000，差额应为 0
            assert('股东A 差额计算正确', Math.abs(aRow.difference) < 1);
        }
    }

    // === [4] 分红计算 ===
    console.log('\n[4] 分红计算');

    const div = await request('GET', `/api/shareholders?action=dividend-summary&projectId=${PROJECT_ID}`);
    assert('分红计算返回成功', div.status === 200 && div.body?.data?.shareholders);
    if (div.body?.data) {
        assert('总收入 > 0', div.body.data.total_income > 0);
        assert('净利润已计算', typeof div.body.data.net_profit === 'number');
    }

    // 分红交易
    if (dividendSubject && acctId && shAId) {
        const divTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 1000, account_id: acctId,
            subject_id: dividendSubject.id, shareholder_id: shAId,
            description: '测试股东A分红'
        });
        assert('股东分红交易成功', divTx.status === 201);
    }

    // === [5] 删除检查 ===
    console.log('\n[5] 删除检查');

    // 有交易的股东不能删除
    const delA = await request('DELETE', `/api/shareholders/${shAId}?projectId=${PROJECT_ID}`);
    assert('有交易的股东不可删除', delA.status === 400 || delA.status === 500);

    // === [6] 回归 ===
    console.log('\n[6] 回归检查');

    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 正常', dash.status === 200);

    const user = await request('GET', '/api/user');
    assert('getUserInfo 正常', user.status === 200);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
