/**
 * 审批工作流端到端测试
 * 覆盖：金额分档、单天累计、串行分级、多人会签、无主管阻断、越权、项目隔离、执行落账
 */
const http = require('http');
const BASE = 'http://localhost:8000';
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}
function request(method, path, body = null, token = '') {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search,
            method, headers: { 'Content-Type': 'application/json' } };
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        const req = http.request(opts, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
                                  catch { resolve({ status: res.statusCode, body: d }); } });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}
const P = 1, DEPT_FINANCE = 1, DEPT_MARKET = 2;
const msg = r => r.body?.error?.message || r.body?.message || '';

async function run() {
    console.log('\n[0] 登录');
    const a = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    const b = await request('POST', '/api/login', { username: 'phpuser', password: 'php123' });
    const c = await request('POST', '/api/login', { username: 'testuser', password: 'user123' });
    const ADMIN = a.body?.data?.token, ADMIN2 = b.body?.data?.token, MGR = c.body?.data?.token;
    assert('admin 登录', !!ADMIN);
    assert('phpuser(第二管理员) 登录', !!ADMIN2, `-> ${msg(b)}`);
    assert('testuser(财务部主管) 登录', !!MGR);
    if (!ADMIN || !MGR) { console.log('登录失败，中止'); process.exit(1); }

    const mk = (amount, dept = DEPT_FINANCE, token = MGR, title = '测试申请') =>
        request('POST', `/api/applications?projectId=${P}`, {
            title: `${title} ${amount}`, amount, type: 'payment', departmentId: dept,
        }, token);

    // ---------- 1. 小额档：只需部门主管 ----------
    console.log('\n[1] 小额档 (≤100)：仅部门主管一级');
    const a1 = await mk(50);
    assert('创建 50 元申请', a1.status === 201, `-> ${msg(a1)}`);
    const id1 = a1.body?.data?.id;
    const ap1 = a1.body?.data?.approvals || [];
    assert('审批链只有 1 级', ap1.length === 1, `实际 ${ap1.length}`);
    assert('该级为部门主管', ap1[0]?.approver_type === 'applicant_dept_manager');
    assert('候选人是 testuser(id=3)', Number(ap1[0]?.candidate_user_id) === 3);

    const notMine = await request('PUT', `/api/applications/${id1}/status?projectId=${P}`, { status: 'approved' }, ADMIN);
    assert('管理员不能越级审批主管节点', notMine.status >= 400, `实际 ${notMine.status}`);

    const ok1 = await request('PUT', `/api/applications/${id1}/status?projectId=${P}`, { status: 'approved', comment: '同意' }, MGR);
    assert('主管审批通过', ok1.status === 200, `-> ${msg(ok1)}`);
    assert('状态转为待归帐', ok1.body?.data?.status === 'to_be_allocated', `实际 ${ok1.body?.data?.status}`);

    // ---------- 2. 单天累计 ----------
    console.log('\n[2] 单天累计：已有 50，再提 60 应跨入中额档');
    const a2 = await mk(60);
    assert('创建 60 元申请', a2.status === 201, `-> ${msg(a2)}`);
    const ap2 = a2.body?.data?.approvals || [];
    assert('累计 110 → 匹配中额档，2 级', ap2.length === 2, `实际 ${ap2.length}（单笔60本应只需1级）`);
    assert('第2级为管理员', ap2[1]?.candidate_role === 'admin');

    // ---------- 3. 串行分级 ----------
    console.log('\n[3] 串行：第一级未过时第二级不可审');
    const id2 = a2.body?.data?.id;
    const early = await request('PUT', `/api/applications/${id2}/status?projectId=${P}`, { status: 'approved' }, ADMIN);
    assert('管理员不能抢在主管之前审批', early.status >= 400, `实际 ${early.status}`);
    const s1 = await request('PUT', `/api/applications/${id2}/status?projectId=${P}`, { status: 'approved' }, MGR);
    assert('主管先审通过', s1.status === 200, `-> ${msg(s1)}`);
    assert('仍为 pending 待第2级', s1.body?.data?.status === 'pending', `实际 ${s1.body?.data?.status}`);
    const s2 = await request('PUT', `/api/applications/${id2}/status?projectId=${P}`, { status: 'approved' }, ADMIN);
    assert('管理员审批后完成', s2.body?.data?.status === 'to_be_allocated', `实际 ${s2.body?.data?.status}`);

    // ---------- 4. 大额会签 ----------
    console.log('\n[4] 大额档 (>10000)：主管 + 2 名管理员会签');
    const a3 = await mk(20000);
    assert('创建 2 万申请', a3.status === 201, `-> ${msg(a3)}`);
    const id3 = a3.body?.data?.id;
    assert('审批链 2 级', (a3.body?.data?.approvals || []).length === 2);
    await request('PUT', `/api/applications/${id3}/status?projectId=${P}`, { status: 'approved' }, MGR);
    const g1 = await request('PUT', `/api/applications/${id3}/status?projectId=${P}`, { status: 'approved' }, ADMIN);
    assert('第1名管理员通过后仍 pending（会签未满）', g1.body?.data?.status === 'pending', `实际 ${g1.body?.data?.status}`);
    const dup = await request('PUT', `/api/applications/${id3}/status?projectId=${P}`, { status: 'approved' }, ADMIN);
    assert('同一管理员不能重复会签', dup.status >= 400, `实际 ${dup.status}`);
    if (ADMIN2) {
        const g2 = await request('PUT', `/api/applications/${id3}/status?projectId=${P}`, { status: 'approved' }, ADMIN2);
        assert('第2名管理员通过后完成', g2.body?.data?.status === 'to_be_allocated', `实际 ${g2.body?.data?.status}`);
    }

    // ---------- 5. 无主管阻断 ----------
    console.log('\n[5] 部门未任命主管应阻断并提示');
    const noMgr = await mk(30, DEPT_MARKET, ADMIN);
    assert('市场部(无主管)提交被拒', noMgr.status >= 400, `实际 ${noMgr.status}`);
    assert('提示需先任命主管', /主管/.test(msg(noMgr)), `-> ${msg(noMgr)}`);

    // ---------- 6. 否决 ----------
    console.log('\n[6] 否决流程');
    const a4 = await mk(20);
    const r4 = await request('PUT', `/api/applications/${a4.body?.data?.id}/status?projectId=${P}`,
        { status: 'rejected', comment: '不同意' }, MGR);
    assert('主管否决', r4.body?.data?.status === 'rejected', `实际 ${r4.body?.data?.status}`);

    // ---------- 7. 归帐 + 执行落账 ----------
    console.log('\n[7] 归帐 → 执行 → 生成流水并动余额');
    const accts = await request('GET', `/api/accounts?projectId=${P}&limit=5`, null, ADMIN);
    const acct = (accts.body?.data || [])[0];
    const subs = await request('GET', `/api/subjects?projectId=${P}&type=expense`, null, ADMIN);
    const sub = (subs.body?.data || [])[0];
    assert('取到账户与科目', !!acct && !!sub);

    if (acct && sub) {
        const before = Number(acct.balance);
        const al = await request('PUT', `/api/applications/${id1}/allocate?projectId=${P}`,
            { account_id: acct.id, subject_id: sub.id }, ADMIN);
        assert('归帐成功', al.status === 200, `-> ${msg(al)}`);
        assert('状态转为待执行', al.body?.data?.status === 'to_be_executed', `实际 ${al.body?.data?.status}`);

        const ex = await request('PUT', `/api/applications/${id1}/execute?projectId=${P}`, {}, ADMIN);
        assert('执行成功', ex.status === 200, `-> ${msg(ex)}`);
        assert('状态转为完成', ex.body?.data?.status === 'completed', `实际 ${ex.body?.data?.status}`);

        const again = await request('PUT', `/api/applications/${id1}/execute?projectId=${P}`, {}, ADMIN);
        assert('不可重复执行', again.status >= 400, `实际 ${again.status}`);

        const after = await request('GET', `/api/accounts?projectId=${P}&limit=5`, null, ADMIN);
        const a2b = (after.body?.data || []).find(x => x.id === acct.id);
        assert('账户余额已扣减 50', Math.abs((before - Number(a2b.balance)) - 50) < 0.01,
               `前 ${before} 后 ${a2b?.balance}`);
    }

    // ---------- 8. 查询接口兼容 ----------
    console.log('\n[8] 前端两种参数名兼容');
    const byType = await request('GET', `/api/applications?projectId=${P}&type=all&limit=50`, null, ADMIN);
    const byStat = await request('GET', `/api/applications?projectId=${P}&status=pending`, null, ADMIN);
    assert('?type=all 可用', byType.status === 200, `-> ${msg(byType)}`);
    assert('?status=pending 可用', byStat.status === 200, `-> ${msg(byStat)}`);
    assert('返回结构含 applications/total', Array.isArray(byType.body?.data?.applications));

    // ---------- 9. 越权与隔离 ----------
    console.log('\n[9] 越权与项目隔离');
    const noTok = await request('GET', `/api/applications?projectId=${P}`);
    assert('无 token 401', noTok.status === 401, `实际 ${noTok.status}`);
    const xProj = await request('GET', `/api/applications?projectId=99`, null, MGR);
    assert('非成员项目 403', xProj.status === 403, `实际 ${xProj.status}`);
    const ruleWrite = await request('POST', `/api/approval-rules?projectId=${P}`, { name: 'x' }, MGR);
    assert('普通用户不能改审批规则', ruleWrite.status === 403, `实际 ${ruleWrite.status}`);

    console.log(`\n${'='.repeat(52)}`);
    console.log(`审批工作流测试：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('测试异常:', e); process.exit(1); });
