/**
 * Round 14 回归测试
 * 1. ConfigRepository SQL 注入防护（列名白名单）
 * 2. 交易详情接口项目权限校验
 * 3. Dashboard 主端点 projectId 校验
 * 4. 转账 fees/to_amount 负数验证
 * 5. 分页 limit 上限限制
 * 6. 配置删除关联数据检查
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

    // === [1] SQL 注入防护测试 ===
    console.log('\n[1] ConfigRepository SQL 注入防护');

    // 先创建一个测试科目
    const subj = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R14测试科目', type: 'income', code: 'R14'
    });
    assert('创建测试科目', subj.status === 201);
    const subjId = subj.body?.data?.id;

    if (subjId) {
        // 尝试使用恶意列名更新
        const malicious = await request('PUT', `/api/subjects/${subjId}?projectId=${PROJECT_ID}`, {
            'name': '正常名称',
            'id = 1; DROP TABLE subjects; --': 'attack'
        });
        // 恶意字段应被过滤，只有 name 被更新
        assert('恶意列名被过滤', malicious.status === 200);
        if (malicious.body?.data) {
            assert('正常字段仍然更新', malicious.body.data.name === '正常名称');
        }
    }

    // === [2] 交易详情权限校验 ===
    console.log('\n[2] 交易详情权限校验');

    // 创建一个测试账户和交易
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R14权限测试账户', account_type: '活期账户', currency_type: 'CNY'
    });
    const acctId = acct.body?.data?.id;

    if (acctId) {
        const tx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 500, account_id: acctId, description: 'R14测试'
        });
        const txId = tx.body?.data?.id;
        assert('创建测试交易', tx.status === 201 && txId);

        if (txId) {
            // 用正确项目查看 — 应成功
            const ok = await request('GET', `/api/transactions/${txId}?projectId=${PROJECT_ID}`);
            assert('正确项目可查看交易', ok.status === 200);

            // 用错误项目查看 — 应被拒绝
            const bad = await request('GET', `/api/transactions/${txId}?projectId=99999`);
            assert('错误项目被拒绝', bad.status === 403);
        }
    }

    // === [3] Dashboard projectId 校验 ===
    console.log('\n[3] Dashboard projectId 校验');

    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    const dashOk = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 正常请求成功', dashOk.status === 200);

    // === [4] 转账 fees/to_amount 验证 ===
    console.log('\n[4] 转账参数验证');

    // 创建第二个账户用于转账
    const acct2 = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R14转入账户', account_type: '活期账户', currency_type: 'CNY'
    });
    const acctId2 = acct2.body?.data?.id;

    if (acctId && acctId2) {
        // 负数 fees
        const negFees = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'transfer', amount: 10, account_id: acctId, target_account_id: acctId2,
            fees: -100, description: '负费用测试'
        });
        assert('负数 fees 被拒绝', negFees.status === 400);

        // 负数 to_amount
        const negTo = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'transfer', amount: 10, account_id: acctId, target_account_id: acctId2,
            to_amount: -50, description: '负转入金额测试'
        });
        assert('负数 to_amount 被拒绝', negTo.status === 400);

        // 正常转账应成功
        const okTransfer = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'transfer', amount: 10, account_id: acctId, target_account_id: acctId2,
            fees: 1, to_amount: 10, description: '正常转账'
        });
        assert('正常转账成功', okTransfer.status === 201);
    }

    // === [5] 分页 limit 上限 ===
    console.log('\n[5] 分页 limit 上限');

    const bigLimit = await request('GET', `/api/accounts?projectId=${PROJECT_ID}&limit=999999`);
    assert('超大 limit 请求不崩溃', bigLimit.status === 200);
    // 验证返回的数据量合理（被限制到 200）
    const items = bigLimit.body?.data || bigLimit.body?.data || [];
    assert('返回数量被限制', Array.isArray(items) && items.length <= 200);

    // === [6] 配置删除关联检查 ===
    console.log('\n[6] 配置删除关联数据检查');

    // 创建科目并关联交易
    const subj2 = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R14关联科目', type: 'income', code: 'R14REF'
    });
    const subj2Id = subj2.body?.data?.id;

    if (subj2Id && acctId) {
        // 创建一笔引用该科目的交易
        await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 100, account_id: acctId,
            subject_id: subj2Id, description: '关联交易'
        });

        // 尝试删除该科目 — 应被拒绝
        const delSubj = await request('DELETE', `/api/subjects/${subj2Id}?projectId=${PROJECT_ID}`);
        assert('有关联交易的科目禁止删除', delSubj.status === 400);
    }

    // 创建无关联的科目，应可删除
    const subj3 = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R14无关联科目', type: 'expense', code: 'R14NREF'
    });
    const subj3Id = subj3.body?.data?.id;
    if (subj3Id) {
        const delOk = await request('DELETE', `/api/subjects/${subj3Id}?projectId=${PROJECT_ID}`);
        assert('无关联科目可删除', delOk.status === 200);
    }

    // 清理：删除测试科目
    if (subjId) {
        await request('DELETE', `/api/subjects/${subjId}?projectId=${PROJECT_ID}`);
    }

    // === 全面回归 ===
    console.log('\n[7] 全面回归');

    const user = await request('GET', '/api/user');
    assert('getUserInfo 安全', user.status === 200 && !user.body?.data?.password);

    const envResp = await request('GET', '/api/../.env');
    assert('.env 被阻止', envResp.status === 403 || envResp.status === 404);

    const summary = await request('GET', `/api/account-summary?projectId=${PROJECT_ID}`);
    assert('账户摘要正常', summary.status === 200);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
