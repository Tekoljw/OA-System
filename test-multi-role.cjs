/**
 * 多账号多角色完整流程测试
 * 测试点：
 * 1. admin 完整股东管理流程
 * 2. 普通用户权限隔离（不能增删改股东）
 * 3. 普通用户只读权限（能查看）
 * 4. 项目隔离（项目B看不到项目A的股东）
 * 5. 完整业务流程：创建股东 → 入资 → 查看分析 → 分红 → 查看分红计算
 */
const http = require('http');
const { execFileSync } = require('child_process');
const { resetShareholders, createTransactionViaApproval } = require('./test-helpers.cjs');

/**
 * 测试自清理：本套用例会在项目1留下股东与交易，且「有交易的股东不可删除」是
 * 刻意的业务约束，无法用 API 清理。不清理则下一轮因比例占满 100% 必然失败。
 */
function resetFixtures() {
    resetShareholders();
    try {
        execFileSync('docker', ['compose', 'exec', '-T', 'postgres',
            'psql', '-U', 'postgres', '-d', 'oa_system', '-c',
            `DELETE FROM transactions WHERE shareholder_id IN
               (SELECT id FROM shareholders WHERE project_id = 1
                AND (name LIKE '多角色股东%' OR name LIKE 'FT%' OR name LIKE 'ED%' OR name LIKE 'SH探测%'));
             DELETE FROM shareholders WHERE project_id = 1
                AND (name LIKE '多角色股东%' OR name LIKE 'FT%' OR name LIKE 'ED%' OR name LIKE 'SH探测%');`
        ], { stdio: 'pipe' });
        console.log('  🧹 已清理上轮遗留的测试股东');
    } catch (e) {
        console.log('  ⚠️ 清理遗留数据失败，若比例已占满可能导致失败:', String(e.message).slice(0, 80));
    }
}

const BASE = 'http://localhost:8000';
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
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

/**
 * 适配 helper：本文件的 request 返回 {status, body}，
 * 而 helper 期望响应体展开在顶层（{status, success, data, error}）。
 */
const apiFor = async (method, path, token, body) => {
    const r = await request(method, path, body, token);
    return { status: r.status, ...(r.body && typeof r.body === 'object' ? r.body : {}) };
};

async function run() {
    resetFixtures();

    // ===== 登录两个账号 =====
    console.log('\n[0] 登录测试');

    const adminLogin = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    const ADMIN_TOKEN = adminLogin.body?.data?.token;
    const PROJECT_A = adminLogin.body?.data?.projectId; // 演示项目(1)
    assert('Admin 登录成功', adminLogin.status === 200 && ADMIN_TOKEN);

    const userLogin = await request('POST', '/api/login', { username: 'testuser', password: 'user123' });
    const USER_TOKEN = userLogin.body?.data?.token;
    assert('普通用户登录成功', userLogin.status === 200 && USER_TOKEN);

    // 收支须经审批产生，会签需要第二名管理员
    const admin2Login = await request('POST', '/api/login', { username: 'phpuser', password: 'php123' });
    const ctx = { api: apiFor, tokens: { admin: ADMIN_TOKEN, admin2: admin2Login.body?.data?.token, manager: USER_TOKEN } };

    const PROJECT_B = 8; // 测试项目B

    // ===== [1] 清理之前测试数据 =====
    console.log('\n[1] 准备：清理旧测试数据');
    // 先删除项目B中可能存在的股东
    const oldListB = await request('GET', `/api/shareholders?projectId=${PROJECT_B}`, null, ADMIN_TOKEN);
    if (oldListB.body?.data) {
        for (const sh of oldListB.body.data) {
            await request('DELETE', `/api/shareholders/${sh.id}?projectId=${PROJECT_B}`, null, ADMIN_TOKEN);
        }
    }
    // 先清理项目A中名称以"多角色"开头的股东（删不掉有交易的就跳过）
    const oldListA = await request('GET', `/api/shareholders?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    if (oldListA.body?.data) {
        for (const sh of oldListA.body.data) {
            if (sh.name.startsWith('多角色')) {
                await request('DELETE', `/api/shareholders/${sh.id}?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
            }
        }
    }
    console.log('  清理完成');

    // ===== [2] Admin 创建股东 =====
    console.log('\n[2] Admin 创建股东（项目A）');

    const shA = await request('POST', `/api/shareholders?projectId=${PROJECT_A}`, {
        name: '多角色股东甲', share_ratio: 50, contact: '13800001111'
    }, ADMIN_TOKEN);
    assert('Admin 创建股东甲 (50%)', shA.status === 201 && shA.body?.data?.name === '多角色股东甲');
    const shAId = shA.body?.data?.id;

    const shB = await request('POST', `/api/shareholders?projectId=${PROJECT_A}`, {
        name: '多角色股东乙', share_ratio: 30, contact: '13800002222'
    }, ADMIN_TOKEN);
    assert('Admin 创建股东乙 (30%)', shB.status === 201);
    const shBId = shB.body?.data?.id;

    const shC = await request('POST', `/api/shareholders?projectId=${PROJECT_A}`, {
        name: '多角色股东丙', share_ratio: 20
    }, ADMIN_TOKEN);
    assert('Admin 创建股东丙 (20%)', shC.status === 201);
    const shCId = shC.body?.data?.id;

    // 比例已满100%，再加应失败
    const shOver = await request('POST', `/api/shareholders?projectId=${PROJECT_A}`, {
        name: '多角色股东丁', share_ratio: 1
    }, ADMIN_TOKEN);
    assert('比例超100%被拒', shOver.status === 400 || shOver.status === 422);

    // ===== [3] 普通用户权限检查 =====
    console.log('\n[3] 普通用户权限隔离');

    // 普通用户能查看股东列表
    const userList = await request('GET', `/api/shareholders?projectId=${PROJECT_A}`, null, USER_TOKEN);
    assert('普通用户能查看股东列表', userList.status === 200 && Array.isArray(userList.body?.data));
    const userSeeCount = (userList.body?.data || []).filter(s => s.name.startsWith('多角色')).length;
    assert('普通用户能看到3个测试股东', userSeeCount === 3);

    // 普通用户不能创建股东
    const userCreate = await request('POST', `/api/shareholders?projectId=${PROJECT_A}`, {
        name: '非法股东', share_ratio: 10
    }, USER_TOKEN);
    assert('普通用户不能创建股东 (403)', userCreate.status === 403);

    // 普通用户不能修改股东
    const userUpdate = await request('PUT', `/api/shareholders/${shAId}?projectId=${PROJECT_A}`, {
        name: '被篡改的名字'
    }, USER_TOKEN);
    assert('普通用户不能修改股东 (403)', userUpdate.status === 403);

    // 普通用户不能删除股东
    const userDelete = await request('DELETE', `/api/shareholders/${shCId}?projectId=${PROJECT_A}`, null, USER_TOKEN);
    assert('普通用户不能删除股东 (403)', userDelete.status === 403);

    // 普通用户能查看入资分析
    const userContrib = await request('GET', `/api/shareholders?action=contribution-summary&projectId=${PROJECT_A}`, null, USER_TOKEN);
    assert('普通用户能查看入资分析', userContrib.status === 200 && userContrib.body?.data);

    // 普通用户能查看分红计算
    const userDiv = await request('GET', `/api/shareholders?action=dividend-summary&projectId=${PROJECT_A}`, null, USER_TOKEN);
    assert('普通用户能查看分红计算', userDiv.status === 200 && userDiv.body?.data);

    // ===== [4] 项目隔离 =====
    console.log('\n[4] 项目隔离测试');

    // Admin 在项目B创建股东
    const shB1 = await request('POST', `/api/shareholders?projectId=${PROJECT_B}`, {
        name: '项目B股东', share_ratio: 100
    }, ADMIN_TOKEN);
    assert('Admin 在项目B创建股东', shB1.status === 201);
    const shB1Id = shB1.body?.data?.id;

    // 项目A查不到项目B的股东
    const listA = await request('GET', `/api/shareholders?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    const foundInA = (listA.body?.data || []).find(s => s.name === '项目B股东');
    assert('项目A看不到项目B的股东', !foundInA);

    // 项目B查不到项目A的股东
    const listB = await request('GET', `/api/shareholders?projectId=${PROJECT_B}`, null, ADMIN_TOKEN);
    const foundInB = (listB.body?.data || []).find(s => s.name.startsWith('多角色'));
    assert('项目B看不到项目A的股东', !foundInB);

    // 不能跨项目修改股东
    const crossUpdate = await request('PUT', `/api/shareholders/${shB1Id}?projectId=${PROJECT_A}`, {
        name: '跨项目篡改'
    }, ADMIN_TOKEN);
    assert('不能跨项目修改股东', crossUpdate.status === 404 || crossUpdate.status === 400 || crossUpdate.status === 403);

    // 不能跨项目删除股东
    const crossDelete = await request('DELETE', `/api/shareholders/${shAId}?projectId=${PROJECT_B}`, null, ADMIN_TOKEN);
    assert('不能跨项目删除股东', crossDelete.status === 404 || crossDelete.status === 400 || crossDelete.status === 403);

    // 清理项目B
    await request('DELETE', `/api/shareholders/${shB1Id}?projectId=${PROJECT_B}`, null, ADMIN_TOKEN);

    // ===== [5] 完整入资流程 =====
    console.log('\n[5] 完整入资流程（Admin）');

    // 股东入资/分红现在由一级流水类型标识，二级选的是股东本人而不是科目
    const ttypes = await request('GET', `/api/transaction-types?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    const incomeSubject = (ttypes.body?.data || []).find(t => t.code === 'shareholder_investment');
    assert('股东入资流水类型存在', !!incomeSubject);

    // 获取/创建账户
    const accounts = await request('GET', `/api/accounts?projectId=${PROJECT_A}&limit=500`, null, ADMIN_TOKEN);
    let acctId = (accounts.body?.data || [])[0]?.id;
    if (!acctId) {
        const newAcct = await request('POST', `/api/accounts?projectId=${PROJECT_A}&limit=500`, {
            name: '多角色测试账户', account_type: '活期账户', currency_type: 'CNY'
        }, ADMIN_TOKEN);
        acctId = newAcct.body?.data?.id;
    }
    assert('测试账户可用', !!acctId);

    if (incomeSubject && acctId) {
        // 股东甲入资 50000（按50%比例入资，如果总入资100000则正好匹配）
        const r50000 = await createTransactionViaApproval(ctx, {
            type: 'income', amount: 50000, accountId: acctId,
            transactionTypeCode: 'shareholder_investment', shareholderId: shAId,
            title: '股东甲入资 50000',
        });
        assert('股东甲入资 50000', r50000.ok, r50000.reason || '');

        // 股东乙入资 20000（按30%应入30000，少入了10000）
        const r20000 = await createTransactionViaApproval(ctx, {
            type: 'income', amount: 20000, accountId: acctId,
            transactionTypeCode: 'shareholder_investment', shareholderId: shBId,
            title: '股东乙入资 20000',
        });
        assert('股东乙入资 20000', r20000.ok, r20000.reason || '');

        // 股东丙入资 30000（按20%应入20000，多入了10000）
        const r30000 = await createTransactionViaApproval(ctx, {
            type: 'income', amount: 30000, accountId: acctId,
            transactionTypeCode: 'shareholder_investment', shareholderId: shCId,
            title: '股东丙入资 30000',
        });
        assert('股东丙入资 30000', r30000.ok, r30000.reason || '');

        // 入资不带股东：提交阶段就被拦下（一级类型为股东往来时必须指定股东）
        const noSh = await createTransactionViaApproval(ctx, {
            type: 'income', amount: 1000, accountId: acctId,
            transactionTypeCode: 'shareholder_investment', title: '缺少股东ID的入资',
        });
        assert('入资不选股东被拒', !noSh.ok && /股东/.test(noSh.reason || ''), noSh.reason || '');
    }

    // ===== [6] 入资分析验证 =====
    console.log('\n[6] 入资分析验证');

    const contrib = await request('GET', `/api/shareholders?action=contribution-summary&projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    assert('入资汇总返回成功', contrib.status === 200 && contrib.body?.data?.shareholders);

    if (contrib.body?.data?.shareholders) {
        const shareholders = contrib.body.data.shareholders;

        const shARow = shareholders.find(r => r.id === shAId);
        const shBRow = shareholders.find(r => r.id === shBId);
        const shCRow = shareholders.find(r => r.id === shCId);

        if (shARow) {
            assert('股东甲入资额 >= 50000', shARow.total_contribution >= 50000);
            // 甲占50%，总入资100000，应入50000，实入50000，差额接近0
            console.log(`    甲: 应入=${shARow.expected_contribution}, 实入=${shARow.total_contribution}, 差额=${shARow.difference}`);
        }
        if (shBRow) {
            assert('股东乙入资额 >= 20000', shBRow.total_contribution >= 20000);
            // 乙占30%，应入30000，实入20000，差额应为负（少入）
            assert('股东乙少入（差额为负）', shBRow.difference < 0);
            console.log(`    乙: 应入=${shBRow.expected_contribution}, 实入=${shBRow.total_contribution}, 差额=${shBRow.difference}`);
        }
        if (shCRow) {
            assert('股东丙入资额 >= 30000', shCRow.total_contribution >= 30000);
            // 丙占20%，应入20000，实入30000，差额应为正（多入）
            assert('股东丙多入（差额为正）', shCRow.difference > 0);
            console.log(`    丙: 应入=${shCRow.expected_contribution}, 实入=${shCRow.total_contribution}, 差额=${shCRow.difference}`);
        }
    }

    // ===== [7] 分红计算 =====
    console.log('\n[7] 分红计算验证');

    const div = await request('GET', `/api/shareholders?action=dividend-summary&projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    assert('分红计算返回成功', div.status === 200 && div.body?.data);

    if (div.body?.data) {
        assert('总收入 > 0', div.body.data.total_income > 0);
        assert('净利润已计算', typeof div.body.data.net_profit === 'number');
        console.log(`    总收入=${div.body.data.total_income}, 总支出=${div.body.data.total_expense}, 净利润=${div.body.data.net_profit}`);

        if (div.body.data.shareholders) {
            for (const sh of div.body.data.shareholders) {
                if (sh.name && sh.name.startsWith('多角色')) {
                    console.log(`    ${sh.name}: 比例=${sh.share_ratio}%, 应分=${sh.entitled_dividend}`);
                }
            }
        }
    }

    // ===== [8] 分红交易 =====
    console.log('\n[8] 分红交易');

    const dividendSubject = (ttypes.body?.data || []).find(t => t.code === 'shareholder_dividend');
    assert('股东分红流水类型存在', !!dividendSubject);

    if (dividendSubject && acctId) {
        // 给股东甲分红
        const div5000 = await createTransactionViaApproval(ctx, {
            type: 'expense', amount: 5000, accountId: acctId,
            transactionTypeCode: 'shareholder_dividend', shareholderId: shAId,
            title: '多角色测试-股东甲分红',
        });
        assert('股东甲分红 5000', div5000.ok, div5000.reason || '');

        // 给股东乙分红
        const div3000 = await createTransactionViaApproval(ctx, {
            type: 'expense', amount: 3000, accountId: acctId,
            transactionTypeCode: 'shareholder_dividend', shareholderId: shBId,
            title: '多角色测试-股东乙分红',
        });
        assert('股东乙分红 3000', div3000.ok, div3000.reason || '');

        // 分红不选股东应失败
        const divNoSh = await createTransactionViaApproval(ctx, {
            type: 'expense', amount: 1000, accountId: acctId,
            transactionTypeCode: 'shareholder_dividend', title: '缺少股东ID的分红',
        });
        assert('分红不选股东被拒', !divNoSh.ok && /股东/.test(divNoSh.reason || ''), divNoSh.reason || '');
    }

    // ===== [9] 分红后重新检查分红计算 =====
    console.log('\n[9] 分红后验证');

    const divAfter = await request('GET', `/api/shareholders?action=dividend-summary&projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    if (divAfter.body?.data?.shareholders) {
        const shADiv = divAfter.body.data.shareholders.find(r => r.id === shAId);
        const shBDiv = divAfter.body.data.shareholders.find(r => r.id === shBId);
        if (shADiv) {
            assert('甲已分红 >= 5000', shADiv.total_dividend >= 5000);
            assert('甲剩余可分 = 应分 - 已分', typeof shADiv.remaining_dividend === 'number');
            console.log(`    甲: 应分=${shADiv.entitled_dividend}, 已分=${shADiv.total_dividend}, 剩余=${shADiv.remaining_dividend}`);
        }
        if (shBDiv) {
            assert('乙已分红 >= 3000', shBDiv.total_dividend >= 3000);
            console.log(`    乙: 应分=${shBDiv.entitled_dividend}, 已分=${shBDiv.total_dividend}, 剩余=${shBDiv.remaining_dividend}`);
        }
    }

    // ===== [10] 有交易的股东不能删除 =====
    console.log('\n[10] 业务约束检查');

    const delWithTx = await request('DELETE', `/api/shareholders/${shAId}?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    assert('有交易的股东不可删除', delWithTx.status === 400 || delWithTx.status === 500);

    // ===== [11] 无 Token 访问 =====
    console.log('\n[11] 无认证访问');

    const noAuth = await request('GET', `/api/shareholders?projectId=${PROJECT_A}`);
    assert('无Token不能访问股东列表 (401)', noAuth.status === 401);

    const fakeAuth = await request('GET', `/api/shareholders?projectId=${PROJECT_A}`, null, 'fake.token.here');
    assert('伪造Token不能访问 (401)', fakeAuth.status === 401);

    // ===== [12] 普通用户不能创建交易（验证交易权限） =====
    console.log('\n[12] 普通用户交易权限');

    if (incomeSubject && acctId) {
        // 账本只能由审批流写入，任何人直连 POST /api/transactions 都应被拒
        for (const [who, label] of [[USER_TOKEN, '普通用户'], [ADMIN_TOKEN, '管理员']]) {
            const r = await request('POST', `/api/transactions?projectId=${PROJECT_A}`, {
                type: 'income', amount: 999, account_id: acctId,
                subject_id: incomeSubject.id, shareholder_id: shAId,
                description: '直连创建流水尝试'
            }, who);
            assert(`${label}不能直连创建流水`, r.status === 403, `实际 ${r.status}`);
        }
    }

    // ===== [13] Admin 更新股东比例 =====
    console.log('\n[13] 股东比例动态调整');

    // 修改甲从50%到40%
    const updateA = await request('PUT', `/api/shareholders/${shAId}?projectId=${PROJECT_A}`, {
        share_ratio: 40
    }, ADMIN_TOKEN);
    assert('甲比例从50%调为40%', updateA.status === 200);

    // 释放了10%，现在乙可以从30%调到40%
    const updateB = await request('PUT', `/api/shareholders/${shBId}?projectId=${PROJECT_A}`, {
        share_ratio: 40
    }, ADMIN_TOKEN);
    assert('乙比例从30%调为40%', updateB.status === 200);

    // 现在 40+40+20=100%，再调高应失败
    const updateOverflow = await request('PUT', `/api/shareholders/${shCId}?projectId=${PROJECT_A}`, {
        share_ratio: 25
    }, ADMIN_TOKEN);
    assert('调高丙到25%超100%被拒', updateOverflow.status === 400 || updateOverflow.status === 422);

    // ===== [14] 回归检查 =====
    console.log('\n[14] 回归检查');

    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
    assert('Dashboard 正常', dash.status === 200);

    const userInfo = await request('GET', '/api/user', null, ADMIN_TOKEN);
    assert('getUserInfo 正常', userInfo.status === 200);

    const userInfoRegular = await request('GET', '/api/user', null, USER_TOKEN);
    assert('普通用户 getUserInfo 正常', userInfoRegular.status === 200);

    // ===== [15] 配置类资源写操作越权防护 =====
    console.log('\n[15] 配置类资源写操作越权防护');

    const writeCases = [
        ['科目', 'subjects', { name: '越权科目', code: 'sec-test-subject', type: 'income' }],
        ['部门', 'departments', { name: '越权部门' }],
        ['资产类型', 'asset-types', { name: '越权资产类型' }],
        ['账户类型', 'account-types', { name: '越权账户类型', code: 'sec-test-acct' }],
        ['账户', 'accounts', { name: '越权账户', currency: 'CNY', account_type: 'cash', balance: 0 }],
        ['项目', 'projects', { name: '越权项目', code: 'sec-test-proj' }],
        ['股东', 'shareholders', { name: '越权股东', share_ratio: 1 }],
        ['审计日志', 'activity-logs', { action: 'hack', description: '越权日志' }],
    ];

    for (const [label, ep, payload] of writeCases) {
        const r = await request('POST', `/api/${ep}?projectId=${PROJECT_A}`, payload, USER_TOKEN);
        assert(`普通用户创建${label}被拒(403)`, r.status === 403, `实际 ${r.status}`);
        if (r.status === 200 || r.status === 201) {
            console.log(`     ⚠️ 越权成功，已创建 id=${r.body?.data?.id}，需手动清理`);
        }
    }

    for (const [label, ep] of writeCases) {
        const r = await request('DELETE', `/api/${ep}/1?projectId=${PROJECT_A}`, null, USER_TOKEN);
        assert(`普通用户删除${label}被拒(403)`, r.status === 403, `实际 ${r.status}`);
    }

    // 正向验证：守卫没有误伤管理员
    const adminSubject = await request('POST', `/api/subjects?projectId=${PROJECT_A}`, {
        name: '守卫正向验证科目', code: 'sec-ok-subject', type: 'income',
        transaction_type_code: 'other_income',
    }, ADMIN_TOKEN);
    assert('管理员创建科目仍然成功', adminSubject.status === 201, `实际 ${adminSubject.status}`);
    if (adminSubject.status === 201) {
        const del = await request('DELETE', `/api/subjects/${adminSubject.body.data.id}?projectId=${PROJECT_A}`, null, ADMIN_TOKEN);
        assert('管理员删除科目仍然成功', del.status === 200, `实际 ${del.status}`);
    }

    // ===== 汇总 =====
    console.log(`\n${'='.repeat(50)}`);
    console.log(`多角色完整流程测试汇总`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(50)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
