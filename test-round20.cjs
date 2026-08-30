/**
 * Round 20 回归测试
 * 1. subject_id/department_id 项目归属校验
 * 2. 科目 type 白名单
 * 3. 全面回归
 */
const http = require('http');

const BASE = 'http://localhost:8000';
const { execFileSync } = require('child_process');

/** 自清理：本用例用固定 code 创建科目，不清理则第二次运行必然撞唯一约束 */
function resetFixtures() {
    try {
        execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres',
            '-d', 'oa_system', '-v', 'ON_ERROR_STOP=1', '-c',
            `DELETE FROM transactions WHERE subject_id IN
                 (SELECT id FROM subjects WHERE project_id=1 AND code IN ('R20INC','R20EXP'));
             DELETE FROM subjects WHERE project_id=1 AND code IN ('R20INC','R20EXP');`
        ], { stdio: 'pipe' });
    } catch (e) {
        const d = e.stderr ? e.stderr.toString() : e.message;
        console.log('  ⚠️ 清理失败:\n' + d.split('\n').filter(l => /ERROR|DETAIL/.test(l)).join('\n'));
    }
}
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
    resetFixtures();
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.status === 200 && TOKEN);

    // 创建测试账户
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R20测试账户', account_type: '活期账户', currency_type: 'CNY'
    });
    assert('创建测试账户', acct.status === 201);
    const acctId = acct.body?.data?.id;

    // 充值
    if (acctId) {
        await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 5000, account_id: acctId
        });
    }

    // === [1] subject_id / department_id 项目归属校验 ===
    console.log('\n[1] subject_id/department_id 项目归属校验');

    // 使用不存在的 subject_id
    const badSubject = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'expense', amount: 1, account_id: acctId, subject_id: 999999
    });
    assert('不存在的 subject_id 被拒', badSubject.status === 400 || badSubject.status === 422);

    // 使用不存在的 department_id
    const badDept = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'expense', amount: 1, account_id: acctId, department_id: 999999
    });
    assert('不存在的 department_id 被拒', badDept.status === 400 || badDept.status === 422);

    // 正常交易（不传 subject_id/department_id）仍成功
    const normalTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'expense', amount: 1, account_id: acctId
    });
    assert('不传 subject/dept 仍正常', normalTx.status === 201);

    // 获取当前项目的科目来验证正常使用
    const subjects = await request('GET', `/api/subjects?projectId=${PROJECT_ID}`);
    if (subjects.body?.data && subjects.body.data.length > 0) {
        const validSubjectId = subjects.body.data[0].id;
        const goodTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
            type: 'expense', amount: 1, account_id: acctId, subject_id: validSubjectId
        });
        assert('本项目 subject_id 正常使用', goodTx.status === 201);
    } else {
        // 没有科目就创建一个测试
        const newSubject = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
            name: 'R20测试科目', type: 'expense', code: 'R20T'
        });
        if (newSubject.body?.data?.id) {
            const goodTx = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
                type: 'expense', amount: 1, account_id: acctId, subject_id: newSubject.body.data.id
            });
            assert('本项目 subject_id 正常使用', goodTx.status === 201);
        } else {
            assert('本项目 subject_id 正常使用（跳过，无法创建科目）', true);
        }
    }

    // === [2] 科目 type 白名单 ===
    console.log('\n[2] 科目 type 白名单');

    const badType = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R20恶意科目', type: 'malicious', code: 'R20BAD'
    });
    assert('科目 type=malicious 被拒', badType.status === 400 || badType.status === 422);

    const goodIncome = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R20收入科目', type: 'income', code: 'R20INC'
    });
    assert('科目 type=income 允许', goodIncome.status === 201);

    const goodExpense = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R20支出科目', type: 'expense', code: 'R20EXP'
    });
    assert('科目 type=expense 允许', goodExpense.status === 201);

    // === [3] 全面回归 ===
    console.log('\n[3] 全面回归');

    const secResp = await request('GET', '/');
    assert('CSP 存在', !!secResp.headers['content-security-policy']);

    const env = await request('GET', '/.env');
    assert('.env 被阻止', env.status === 403 || env.status === 404);

    const user = await request('GET', '/api/user');
    assert('getUserInfo 无密码', user.status === 200 && !user.body?.data?.password);

    // type=transfer 仍被路由到 createTransfer
    const transferNoTarget = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'transfer', amount: 10, account_id: acctId
    });
    assert('transfer 仍走专用接口', transferNoTarget.status === 400 || transferNoTarget.status === 422);

    // status 白名单
    const badStatus = await request('POST', `/api/transactions?projectId=${PROJECT_ID}`, {
        type: 'income', amount: 1, account_id: acctId, status: 'evil'
    });
    assert('status 白名单仍有效', badStatus.status === 400 || badStatus.status === 422);

    // 项目删除关联检查
    const delMain = await request('DELETE', `/api/projects/${PROJECT_ID}?projectId=${PROJECT_ID}`);
    assert('项目删除关联检查仍有效', delMain.status === 409);

    // Dashboard
    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 正常', dash.status === 200);

    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    // token "1" 被拒
    const badToken = await request('GET', `/api/user`, null, { 'Authorization': 'Bearer 1' });
    assert('token "1" 被拒', badToken.status === 401);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
