/**
 * 完整业务链路 + 跨模块数字自洽。
 *
 * 现有套件验的都是单点：提申请能落库、审批能通过、执行能扣款、衍生记录数值对。
 * 但没有一个把一条业务从头走到尾，再回过头看四处数字是否同时正确、彼此自洽。
 * 财务系统最难发现的错误恰恰在这里 —— 单看每一步都对，合起来对不上账。
 *
 * 这个套件跑一笔完整的采购：
 *   提交申请 → 部门主管审批 → 两名管理员会签 → 归账 → 执行落账 → 衍生资产
 * 每一步之后核对：
 *   1. 账户余额精确扣减申请金额（不多不少）
 *   2. 衍生的资产记录：数量、单价（金额÷数量）、总价、余值、部门
 *   3. 仪表盘「按部门」分组合计 == 「按科目」分组合计 == 数据库当月支出总额
 *   4. 三者相对基线的增量正好等于这笔金额
 *
 * 第 3 条是关键：两个分组口径必须各自完整覆盖同一批流水。任何一个漏掉一类
 * （比如没有科目的股东入资、还款），合计就对不上 —— 而单看那个饼图完全正常。
 *
 * 另外守一条方向约束：支出申请不能挂到收入科目。这个校验一度形同虚设 ——
 * 它读的是 $d['subject_id']，而路由把前端的 subjectId 映射成了
 * allocated_subject_id，字段名对不上，!empty() 直接跳过整个校验。
 */
const { execFileSync } = require('child_process');

const BASE = process.env.OA_BASE_URL || 'http://localhost:8000';
const PROJECT = 1;
let pass = 0, fail = 0;
const assert = (name, ok, extra = '') => {
    console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ' ' + extra}`);
    ok ? pass++ : fail++;
};

async function api(method, path, token, body) {
    const r = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const msg = r => r?.error?.message || r?.message || '';

function q(sql) {
    return execFileSync('docker',
        ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'oa_system', '-tAc', sql],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

const near = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;
const TAG = 'CHAIN' + Math.floor(Math.random() * 100000);
const AMOUNT = 5000;
const QTY = 2;

/** 当月 CNY 支出总额，作为独立于被测代码的对照基准 */
const monthlyExpense = () => Number(q(
    `SELECT COALESCE(sum(t.amount),0) FROM transactions t JOIN accounts a ON a.id=t.account_id
     WHERE t.project_id=${PROJECT} AND t.status='completed' AND t.type='expense'
       AND a.currency_type='CNY' AND t.transaction_date >= date_trunc('month', CURRENT_DATE)`));

/** 把仪表盘某个分组的 CNY 金额加总 */
const sumGroup = (rows) => (rows || [])
    .filter(r => r.currency_type === 'CNY')
    .reduce((s, r) => s + Number(r.total || 0), 0);

(async () => {
    const login = async (u, p) => (await api('POST', '/api/login', '', { username: u, password: p })).data?.token;
    const ADMIN = await login('admin', 'admin123');
    const MGR   = await login('testuser', 'user123');
    const ADM2  = await login('phpuser', 'php123');
    assert('三种身份登录', !!ADMIN && !!MGR && !!ADM2);
    if (!ADMIN || !MGR || !ADM2) process.exit(1);

    const acctId = q(`SELECT id FROM accounts WHERE project_id=${PROJECT} AND currency_type='CNY'
                      AND status='active' AND balance > ${AMOUNT * 2} ORDER BY balance DESC LIMIT 1`);
    const typeId = q(`SELECT id FROM asset_types WHERE project_id=${PROJECT} LIMIT 1`);
    const deptId = q(`SELECT id FROM departments WHERE project_id=${PROJECT} AND manager_id IS NOT NULL LIMIT 1`);
    assert('取到账户 / 资产分类 / 有主管的部门', !!acctId && !!typeId && !!deptId,
           `账户=${acctId} 分类=${typeId} 部门=${deptId}`);
    if (!acctId || !typeId || !deptId) process.exit(1);

    const balBefore = Number(q(`SELECT balance FROM accounts WHERE id=${acctId}`));
    const expBefore = monthlyExpense();
    const assetsBefore = Number(q(`SELECT count(*) FROM assets WHERE project_id=${PROJECT}`));

    console.log('\n[1] 提交采购申请');
    const created = await api('POST', `/api/applications?projectId=${PROJECT}`, MGR, {
        title: `${TAG}采购`, amount: String(AMOUNT), type: 'expense',
        transaction_type_code: 'asset_purchase_expense',
        asset_type_id: Number(typeId), departmentId: Number(deptId), quantity: QTY,
    });
    assert('提交成功', created.success === true, msg(created));
    const appId = created.data?.id;
    if (!appId) { console.log('\n业务链路：无法建单，中止'); process.exit(1); }

    const chain = q(`SELECT count(*) FROM application_approvals WHERE application_id=${appId}`);
    assert('生成了审批链', Number(chain) > 0, `节点数 ${chain}`);

    console.log('\n[2] 走完审批链');
    for (const [who, tok] of [['部门主管', MGR], ['管理员1', ADMIN], ['管理员2', ADM2]]) {
        const r = await api('PUT', `/api/applications/${appId}/status?projectId=${PROJECT}`, tok,
                            { status: 'approved', comment: TAG });
        assert(`${who}审批`, r.success === true, msg(r));
    }
    assert('状态转为待归账', q(`SELECT status FROM applications WHERE id=${appId}`) === 'to_be_allocated');

    console.log('\n[3] 归账 → 执行');
    const al = await api('PUT', `/api/applications/${appId}/allocate?projectId=${PROJECT}`, ADMIN,
                         { account_id: Number(acctId) });
    assert('归账成功', al.success === true, msg(al));
    const ex = await api('PUT', `/api/applications/${appId}/execute?projectId=${PROJECT}`, ADMIN, {});
    assert('执行成功', ex.success === true, msg(ex));

    console.log('\n[4] 账户与衍生资产');
    const balAfter = Number(q(`SELECT balance FROM accounts WHERE id=${acctId}`));
    assert(`账户精确扣减 ${AMOUNT}`, near(balBefore - balAfter, AMOUNT),
           `前 ${balBefore} 后 ${balAfter}`);

    const assetsAfter = Number(q(`SELECT count(*) FROM assets WHERE project_id=${PROJECT}`));
    assert('生成了一条资产记录', assetsAfter === assetsBefore + 1, `${assetsBefore} → ${assetsAfter}`);

    const asset = q(`SELECT quantity||'|'||unit_price||'|'||total_price||'|'||remaining_value||'|'||department_id
                     FROM assets WHERE project_id=${PROJECT} ORDER BY id DESC LIMIT 1`).split('|');
    assert(`资产数量 = ${QTY}`, Number(asset[0]) === QTY, `实际 ${asset[0]}`);
    assert(`单价 = 金额÷数量 = ${AMOUNT / QTY}`, near(asset[1], AMOUNT / QTY), `实际 ${asset[1]}`);
    assert(`总价 = ${AMOUNT}`, near(asset[2], AMOUNT), `实际 ${asset[2]}`);
    assert('初始余值等于总价', near(asset[3], asset[2]), `余值 ${asset[3]} 总价 ${asset[2]}`);
    assert('部门与申请一致', String(asset[4]) === String(deptId), `实际 ${asset[4]}`);

    console.log('\n[5] 跨模块数字自洽');
    const expAfter = monthlyExpense();
    assert(`当月支出增加 ${AMOUNT}`, near(expAfter - expBefore, AMOUNT),
           `前 ${expBefore} 后 ${expAfter}`);

    const dash = await api('GET', `/api/dashboard?projectId=${PROJECT}`, ADMIN);
    const byDept = sumGroup(dash.data?.expenseByDepartment);
    const bySubj = sumGroup(dash.data?.expenseBySubject);
    // 两个分组口径必须各自完整覆盖同一批流水，漏掉一类就对不上
    assert('仪表盘「按部门」合计 == 数据库当月支出', near(byDept, expAfter),
           `部门合计 ${byDept.toFixed(2)} / 数据库 ${expAfter.toFixed(2)}`);
    assert('仪表盘「按科目」合计 == 数据库当月支出', near(bySubj, expAfter),
           `科目合计 ${bySubj.toFixed(2)} / 数据库 ${expAfter.toFixed(2)}`);
    assert('两个分组口径互相吻合', near(byDept, bySubj),
           `部门 ${byDept.toFixed(2)} / 科目 ${bySubj.toFixed(2)}`);

    console.log('\n[6] 科目方向约束');
    // 支出不能挂到收入科目。这条校验一度因为字段名对不上而完全失效
    const incSubj = q(`SELECT id FROM subjects WHERE project_id=${PROJECT} AND type='income' LIMIT 1`);
    if (incSubj) {
        const bad = await api('POST', `/api/applications?projectId=${PROJECT}`, ADMIN, {
            title: `${TAG}错配`, amount: '100', type: 'expense',
            transaction_type_code: 'operating_expense',
            subjectId: Number(incSubj), departmentId: Number(deptId),
        });
        assert('支出申请挂到收入科目被拒', bad.success !== true, '竟然接受了');
        if (bad.data?.id) q(`DELETE FROM applications WHERE id=${bad.data.id}`);
    }

    // 清理：申请单已执行落账，流水与资产要一并删掉才能回到基线
    q(`DELETE FROM transactions WHERE description LIKE '%${TAG}%'`);
    q(`DELETE FROM assets WHERE name LIKE '%${TAG}%'`);
    q(`DELETE FROM application_approvals WHERE application_id=${appId}`);
    q(`DELETE FROM applications WHERE id=${appId}`);
    q(`DELETE FROM activity_logs WHERE description LIKE '%${TAG}%'`);
    q(`UPDATE accounts SET balance=${balBefore} WHERE id=${acctId}`);

    console.log(`\n业务链路自洽：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
