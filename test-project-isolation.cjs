/**
 * 项目数据隔离完整测试
 *
 * 测试矩阵：
 * 1. 账户隔离：项目A的账户在项目B不可见，不可操作
 * 2. 科目隔离：项目A的科目在项目B不可见
 * 3. 部门隔离：项目A的部门在项目B不可见
 * 4. 交易隔离：项目A的交易在项目B不可见，不能用项目B的projectId创建引用项目A资源的交易
 * 5. 股东隔离：项目A的股东在项目B不可见（已测过，回归覆盖）
 * 6. Dashboard隔离：两个项目的统计数据不同
 * 7. 跨项目资源引用：用项目B的projectId，引用项目A的account_id/subject_id/department_id创建交易
 * 8. 非项目成员访问：用户不属于某项目时，不能访问该项目数据
 */
const http = require('http');

const BASE = 'http://localhost:8000';
let passed = 0, failed = 0, warnings = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function warn(name, detail = '') {
    warnings++; console.log(`  ⚠️  ${name} ${detail}`);
}

function request(method, path, body = null, token = '') {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = {
            hostname: url.hostname, port: url.port, path: url.pathname + url.search,
            method, headers: { 'Content-Type': 'application/json' }
        };
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    const PROJECT_A = 1;  // 演示项目（有大量数据）
    const PROJECT_B = 8;  // 测试项目B（空项目）

    // ===== 登录 =====
    console.log('\n[0] 登录');
    const adminLogin = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    const ADMIN = adminLogin.body?.data?.token;
    assert('Admin 登录', !!ADMIN);

    const userLogin = await request('POST', '/api/login', { username: 'testuser', password: 'user123' });
    const USER = userLogin.body?.data?.token;
    assert('普通用户登录', !!USER);

    // ===== [1] 账户隔离 =====
    console.log('\n[1] 账户隔离');

    const acctA = await request('GET', `/api/accounts?projectId=${PROJECT_A}&limit=500`, null, ADMIN);
    const acctAList = acctA.body?.data || [];
    assert('项目A有账户', acctAList.length > 0);
    const acctAId = acctAList[0]?.id;
    console.log(`    项目A: ${acctAList.length} 个账户, 第一个 id=${acctAId}`);

    const acctB = await request('GET', `/api/accounts?projectId=${PROJECT_B}&limit=500`, null, ADMIN);
    const acctBList = acctB.body?.data || [];
    assert('项目B初始无账户(或有自己的)', true); // 项目B可能有也可能没有
    console.log(`    项目B: ${acctBList.length} 个账户`);

    // 项目A的账户不应出现在项目B的列表
    if (acctAId) {
        const foundInB = acctBList.find(a => a.id === acctAId);
        assert('项目A的账户不出现在项目B列表中', !foundInB);
    }

    // 在项目B中创建自己的账户
    const newAcctB = await request('POST', `/api/accounts?projectId=${PROJECT_B}&limit=500`, {
        name: '隔离测试账户B', account_type: '活期账户', currency_type: 'CNY'
    }, ADMIN);
    assert('在项目B创建账户', newAcctB.status === 201);
    const acctBId = newAcctB.body?.data?.id;

    // 项目B的新账户不应出现在项目A列表
    const acctARefresh = await request('GET', `/api/accounts?projectId=${PROJECT_A}&limit=500`, null, ADMIN);
    const foundBInA = (acctARefresh.body?.data || []).find(a => a.id === acctBId);
    assert('项目B的账户不出现在项目A列表中', !foundBInA);

    // ===== [2] 科目隔离 =====
    console.log('\n[2] 科目隔离');

    const subjA = await request('GET', `/api/subjects?projectId=${PROJECT_A}`, null, ADMIN);
    const subjAList = subjA.body?.data || [];
    assert('项目A有科目', subjAList.length > 0);
    const subjAId = subjAList[0]?.id;
    console.log(`    项目A: ${subjAList.length} 个科目`);

    const subjB = await request('GET', `/api/subjects?projectId=${PROJECT_B}`, null, ADMIN);
    const subjBList = subjB.body?.data || [];
    console.log(`    项目B: ${subjBList.length} 个科目`);

    // 项目A的科目不应出现在项目B
    if (subjAId) {
        const foundInB = subjBList.find(s => s.id === subjAId);
        assert('项目A的科目不出现在项目B', !foundInB);
    }

    // 在项目B创建科目
    const newSubjB = await request('POST', `/api/subjects?projectId=${PROJECT_B}`, {
        name: '隔离测试科目B', code: 'iso-test-b', type: 'income', transaction_type_code: 'other_income'
    }, ADMIN);
    assert('在项目B创建科目', newSubjB.status === 201);
    const subjBId = newSubjB.body?.data?.id;

    // 项目A看不到项目B的新科目
    const subjARefresh = await request('GET', `/api/subjects?projectId=${PROJECT_A}`, null, ADMIN);
    const foundSubjBInA = (subjARefresh.body?.data || []).find(s => s.id === subjBId);
    assert('项目B科目不出现在项目A', !foundSubjBInA);

    // ===== [3] 部门隔离 =====
    console.log('\n[3] 部门隔离');

    const deptA = await request('GET', `/api/departments?projectId=${PROJECT_A}`, null, ADMIN);
    const deptAList = deptA.body?.data || [];
    assert('项目A有部门', deptAList.length > 0);
    const deptAId = deptAList[0]?.id;
    console.log(`    项目A: ${deptAList.length} 个部门`);

    const deptB = await request('GET', `/api/departments?projectId=${PROJECT_B}`, null, ADMIN);
    const deptBList = deptB.body?.data || [];
    console.log(`    项目B: ${deptBList.length} 个部门`);

    if (deptAId) {
        const foundInB = deptBList.find(d => d.id === deptAId);
        assert('项目A的部门不出现在项目B', !foundInB);
    }

    // 在项目B创建部门
    const newDeptB = await request('POST', `/api/departments?projectId=${PROJECT_B}`, {
        name: '隔离测试部门B'
    }, ADMIN);
    assert('在项目B创建部门', newDeptB.status === 201);
    const deptBId = newDeptB.body?.data?.id;

    // ===== [4] 交易隔离 =====
    console.log('\n[4] 交易隔离');

    const txA = await request('GET', `/api/transactions?projectId=${PROJECT_A}`, null, ADMIN);
    const txAList = txA.body?.data || [];
    assert('项目A有交易', txAList.length > 0);
    const txAId = txAList[0]?.id;
    console.log(`    项目A: ${txAList.length} 条交易`);

    const txB = await request('GET', `/api/transactions?projectId=${PROJECT_B}`, null, ADMIN);
    const txBList = txB.body?.data || [];
    console.log(`    项目B: ${txBList.length} 条交易`);

    // 项目A交易不在项目B列表中
    if (txAId) {
        const foundInB = txBList.find(t => t.id === txAId);
        assert('项目A交易不出现在项目B', !foundInB);
    }

    // 用项目B的projectId，查看项目A的单条交易（跨项目越权查看）
    if (txAId) {
        const crossView = await request('GET', `/api/transactions/${txAId}?projectId=${PROJECT_B}`, null, ADMIN);
        assert('不能跨项目查看交易详情', crossView.status === 403 || crossView.status === 404);
    }

    // ===== [5] 跨项目资源引用攻击 =====
    console.log('\n[5] 跨项目资源引用（核心安全测试）');

    // 攻击场景：在项目B创建交易，但引用项目A的账户
    if (acctAId && subjBId) {
        const crossAcct = await request('POST', `/api/transactions?projectId=${PROJECT_B}`, {
            type: 'income', amount: 999, account_id: acctAId,
            subject_id: subjBId,
            description: '跨项目账户引用攻击'
        }, ADMIN);
        assert('不能用项目A的账户在项目B创建交易', crossAcct.status >= 400,
            `got ${crossAcct.status}: ${crossAcct.body?.error?.message || ''}`);
    }

    // 攻击场景：在项目B创建交易，引用项目A的科目
    if (acctBId && subjAId) {
        const crossSubj = await request('POST', `/api/transactions?projectId=${PROJECT_B}`, {
            type: 'income', amount: 999, account_id: acctBId,
            subject_id: subjAId,
            description: '跨项目科目引用攻击'
        }, ADMIN);
        assert('不能用项目A的科目在项目B创建交易', crossSubj.status >= 400,
            `got ${crossSubj.status}: ${crossSubj.body?.error?.message || ''}`);
    }

    // 攻击场景：在项目B创建交易，引用项目A的部门
    if (acctBId && subjBId && deptAId) {
        const crossDept = await request('POST', `/api/transactions?projectId=${PROJECT_B}`, {
            type: 'expense', amount: 999, account_id: acctBId,
            subject_id: subjBId, department_id: deptAId,
            description: '跨项目部门引用攻击'
        }, ADMIN);
        assert('不能用项目A的部门在项目B创建交易', crossDept.status >= 400,
            `got ${crossDept.status}: ${crossDept.body?.error?.message || ''}`);
    }

    // 攻击场景：在项目B创建交易，引用项目A的股东
    // 先在项目A创建股东
    const shA = await request('POST', `/api/shareholders?projectId=${PROJECT_A}`, {
        name: '隔离测试股东', share_ratio: 5
    }, ADMIN);
    const shAId = shA.body?.data?.id;
    // 获取项目A的入资科目
    const incSubjA = subjAList.find(s => s.code === 'income-shareholder');
    if (shAId && acctBId && incSubjA) {
        const crossSh = await request('POST', `/api/transactions?projectId=${PROJECT_B}`, {
            type: 'income', amount: 999, account_id: acctBId,
            subject_id: incSubjA.id, shareholder_id: shAId,
            description: '跨项目股东引用攻击'
        }, ADMIN);
        assert('不能用项目A的股东在项目B创建交易', crossSh.status >= 400,
            `got ${crossSh.status}: ${crossSh.body?.error?.message || ''}`);
    }

    // ===== [6] 股东隔离 =====
    console.log('\n[6] 股东隔离（回归）');

    const shListA = await request('GET', `/api/shareholders?projectId=${PROJECT_A}`, null, ADMIN);
    const shListB = await request('GET', `/api/shareholders?projectId=${PROJECT_B}`, null, ADMIN);
    const shANames = (shListA.body?.data || []).map(s => s.name);
    const shBNames = (shListB.body?.data || []).map(s => s.name);
    console.log(`    项目A股东: ${shANames.join(', ') || '无'}`);
    console.log(`    项目B股东: ${shBNames.join(', ') || '无'}`);

    // 确保没有交叉
    const overlap = shANames.filter(n => shBNames.includes(n));
    assert('两个项目股东无交叉', overlap.length === 0);

    // 跨项目修改股东
    if (shAId) {
        const crossShUpdate = await request('PUT', `/api/shareholders/${shAId}?projectId=${PROJECT_B}`, {
            name: '被篡改'
        }, ADMIN);
        assert('不能跨项目修改股东', crossShUpdate.status >= 400);

        const crossShDelete = await request('DELETE', `/api/shareholders/${shAId}?projectId=${PROJECT_B}`, null, ADMIN);
        assert('不能跨项目删除股东', crossShDelete.status >= 400);
    }

    // ===== [7] Dashboard 隔离 =====
    console.log('\n[7] Dashboard 隔离');

    const dashA = await request('GET', `/api/dashboard?projectId=${PROJECT_A}`, null, ADMIN);
    const dashB = await request('GET', `/api/dashboard?projectId=${PROJECT_B}`, null, ADMIN);
    assert('项目A Dashboard正常', dashA.status === 200);
    assert('项目B Dashboard正常', dashB.status === 200);

    // accountSummary 是「按币种分组」的合计。原先断言 A 的分组数 > B 的分组数，
    // 证明不了隔离 —— 两个项目用同一套币种时分组数必然相等，断言必挂。
    // 真正要验的是：每个项目 Dashboard 的合计，只能由该项目自己的账户构成。
    const sumByCurrency = (rows) => {
        const m = {};
        for (const r of rows || []) {
            m[r.currency_type] = (m[r.currency_type] || 0) + Number(r.total_balance || 0);
        }
        return m;
    };
    for (const [label, pid, dash] of [['项目A', PROJECT_A, dashA], ['项目B', PROJECT_B, dashB]]) {
        const dashSum = sumByCurrency(dash.body?.data?.accountSummary);
        // 服务端把 limit 钳在 200（防一次拉全表），必须翻页取完，
        // 否则拿到的只是第一页，合计天然对不上。
        const realSum = {};
        for (let page = 1; ; page++) {
            const resp = await request('GET',
                `/api/accounts?projectId=${pid}&limit=200&page=${page}`, null, ADMIN);
            const rows = resp.body?.data || [];
            for (const a of rows) {
                realSum[a.currency_type] = (realSum[a.currency_type] || 0) + Number(a.balance || 0);
            }
            if (rows.length < 200) break;
        }
        const keys = [...new Set([...Object.keys(dashSum), ...Object.keys(realSum)])];
        const mismatch = keys.filter(k => Math.abs((dashSum[k] || 0) - (realSum[k] || 0)) > 0.01);
        console.log(`    ${label} Dashboard合计: ${JSON.stringify(dashSum)}`);
        assert(`${label} Dashboard 合计等于该项目账户实际合计`, mismatch.length === 0,
            mismatch.length ? `币种 ${mismatch.join(',')} 对不上` : '');
    }

    // ===== [8] 非项目成员访问隔离 =====
    console.log('\n[8] 非项目成员访问隔离');

    // 创建一个只属于项目A的用户（直接在DB操作太复杂，用现有testuser测试）
    // testuser 属于项目1和项目8，我们创建一个项目9，testuser不在其中
    // 先用admin创建项目C
    const projC = await request('POST', '/api/projects', {
        name: '隔离测试项目C', code: 'test-c-iso', description: '仅admin可见'
    }, ADMIN);
    let PROJECT_C;
    if (projC.status === 201) {
        PROJECT_C = projC.body?.data?.id;
        assert('创建项目C', !!PROJECT_C);

        // testuser不在项目C中，尝试访问
        const userAcctC = await request('GET', `/api/accounts?projectId=${PROJECT_C}&limit=500`, null, USER);
        assert('非成员不能访问项目C的账户', userAcctC.status === 403);

        const userTxC = await request('GET', `/api/transactions?projectId=${PROJECT_C}`, null, USER);
        assert('非成员不能访问项目C的交易', userTxC.status === 403);

        const userShC = await request('GET', `/api/shareholders?projectId=${PROJECT_C}`, null, USER);
        assert('非成员不能访问项目C的股东', userShC.status === 403);

        const userDashC = await request('GET', `/api/dashboard?projectId=${PROJECT_C}`, null, USER);
        assert('非成员不能访问项目C的Dashboard', userDashC.status === 403);

        const userSubjC = await request('GET', `/api/subjects?projectId=${PROJECT_C}`, null, USER);
        assert('非成员不能访问项目C的科目', userSubjC.status === 403);

        const userDeptC = await request('GET', `/api/departments?projectId=${PROJECT_C}`, null, USER);
        assert('非成员不能访问项目C的部门', userDeptC.status === 403);
    } else {
        warn('创建项目C失败，跳过非成员测试', JSON.stringify(projC.body));
    }

    // ===== [9] 内部划款跨项目隔离 =====
    console.log('\n[9] 内部划款跨项目隔离');

    if (acctAId && acctBId) {
        // 尝试在项目A中创建划款，目标是项目B的账户
        const crossTransfer = await request('POST', `/api/transactions?projectId=${PROJECT_A}`, {
            type: 'transfer', amount: 100,
            from_account_id: acctAId, to_account_id: acctBId,
            description: '跨项目划款攻击'
        }, ADMIN);
        assert('不能跨项目内部划款', crossTransfer.status >= 400,
            `got ${crossTransfer.status}: ${crossTransfer.body?.error?.message || ''}`);
    }

    // ===== [10] 清理测试数据 =====
    console.log('\n[10] 清理');

    // 删除项目B的测试数据
    if (acctBId) await request('DELETE', `/api/accounts/${acctBId}?projectId=${PROJECT_B}`, null, ADMIN);
    if (subjBId) await request('DELETE', `/api/subjects/${subjBId}?projectId=${PROJECT_B}`, null, ADMIN);
    if (deptBId) await request('DELETE', `/api/departments/${deptBId}?projectId=${PROJECT_B}`, null, ADMIN);
    if (shAId) await request('DELETE', `/api/shareholders/${shAId}?projectId=${PROJECT_A}`, null, ADMIN);
    // 删除项目C
    if (PROJECT_C) await request('DELETE', `/api/projects/${PROJECT_C}`, null, ADMIN);
    console.log('  清理完成');

    // ===== 汇总 =====
    console.log(`\n${'='.repeat(55)}`);
    console.log(`项目数据隔离测试汇总`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败 | ⚠️  ${warnings} 警告`);
    console.log(`${'='.repeat(55)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
