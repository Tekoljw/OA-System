/**
 * 交易与内部划款端到端测试
 *
 * 财务系统最核心的部分：每一笔都要真实影响账户余额，且必须是原子的。
 * 重点验证余额变动方向与金额、手续费归属、余额不足拦截、并发一致性，
 * 以及内部划款页与「划款单」数据源的字段对应关系。
 */
const http = require('http');
const { psql } = require('./test-helpers.cjs');

const BASE = 'http://localhost:8000';
const TAG = 'TX' + Date.now().toString().slice(-6);
let passed = 0, failed = 0;
const assert = (n, c, d = '') => c ? (passed++, console.log(`  ✅ ${n}`))
                                   : (failed++, console.log(`  ❌ ${n} ${d}`));

function api(method, path, token, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search,
                       method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
        const req = http.request(opts, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(d) }); }
                                  catch { resolve({ status: res.statusCode, raw: d }); } });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}
const msg = r => r?.error?.message || r?.message || '';
const P = 1;

/** 余额必须按 id 精确取：账户列表按 id 倒序分页，靠前几页取不到早期账户 */
async function balanceOf(token, id) {
    const r = await api('GET', `/api/accounts?projectId=${P}&limit=500`, token);
    const a = (r.data || []).find(x => x.id === id);
    return a ? parseFloat(a.balance) : null;
}

function resetFixtures() {
    psql(`
        DELETE FROM loan_settlements WHERE project_id=1;
        DELETE FROM application_approvals WHERE transfer_id IN (SELECT id FROM transfers WHERE project_id=1);
        DELETE FROM transfers WHERE project_id=1;
        DELETE FROM transactions WHERE project_id=1 AND description LIKE 'TX%';
        DELETE FROM accounts WHERE project_id=1 AND name LIKE 'TX%';`, '交易测试清理');
    console.log('  🧹 已清理测试数据');
}

async function run() {
    resetFixtures();
    const login = await api('POST', '/api/login', '', { username: 'admin', password: 'admin123' });
    const T = login?.data?.token;
    assert('管理员登录', !!T);
    if (!T) process.exit(1);

    // 自建两个账户，避免依赖库中既有数据
    const mkAcc = async (name) => {
        const r = await api('POST', `/api/accounts?projectId=${P}`, T, {
            name, accountNumber: `${TAG}-${name}`, accountType: 'current',
            currencyType: 'CNY', bank: '测试银行', limit: 0,
        });
        return r?.data?.id;
    };
    const accA = await mkAcc(`${TAG}账户A`);
    const accB = await mkAcc(`${TAG}账户B`);
    assert('创建两个测试账户', !!accA && !!accB, `A=${accA} B=${accB}`);

    const subs = await api('GET', `/api/subjects?projectId=${P}`, T);
    const incomeSub = (subs.data || []).find(s => s.type === 'income');
    const expenseSub = (subs.data || []).find(s => s.type === 'expense');
    assert('取到收入与支出科目', !!incomeSub && !!expenseSub);

    // ---------- 1. 收入 ----------
    console.log('\n[1] 收入：余额增加');
    const b0 = await balanceOf(T, accA);
    const inc = await api('POST', `/api/transactions?projectId=${P}`, T, {
        type: 'income', amount: 10000, account_id: accA, subject_id: incomeSub.id,
        description: `${TAG}收入`,
    });
    assert('创建收入交易', inc.status === 201, `-> ${msg(inc)}`);
    const b1 = await balanceOf(T, accA);
    assert('余额精确增加 10000', b1 - b0 === 10000, `${b0} → ${b1}`);

    // ---------- 2. 支出 ----------
    console.log('\n[2] 支出：余额减少');
    const exp = await api('POST', `/api/transactions?projectId=${P}`, T, {
        type: 'expense', amount: 3000, account_id: accA, subject_id: expenseSub.id,
        description: `${TAG}支出`,
    });
    assert('创建支出交易', exp.status === 201, `-> ${msg(exp)}`);
    const b2 = await balanceOf(T, accA);
    assert('余额精确减少 3000', b1 - b2 === 3000, `${b1} → ${b2}`);

    // ---------- 3. 余额不足 ----------
    console.log('\n[3] 余额不足拦截');
    const over = await api('POST', `/api/transactions?projectId=${P}`, T, {
        type: 'expense', amount: 99999999, account_id: accA, subject_id: expenseSub.id,
        description: `${TAG}超支`,
    });
    assert('超额支出被拒', over.status >= 400 && /余额不足/.test(msg(over)), `-> ${msg(over)}`);
    assert('被拒后余额未变', await balanceOf(T, accA) === b2);

    // ---------- 4. 类型与金额校验 ----------
    console.log('\n[4] 输入校验');
    for (const [label, body, kw] of [
        ['非法类型', { type: 'hack', amount: 1, account_id: accA }, /类型/],
        ['金额为负', { type: 'expense', amount: -1, account_id: accA, subject_id: expenseSub.id }, /金额/],
        ['金额为零', { type: 'expense', amount: 0, account_id: accA, subject_id: expenseSub.id }, /金额/],
    ]) {
        const r = await api('POST', `/api/transactions?projectId=${P}`, T, { ...body, description: `${TAG}${label}` });
        assert(`${label}被拒`, r.status >= 400 && kw.test(msg(r)), `-> ${msg(r)}`);
    }

    // ---------- 5. 内部划款：单据 → 审批 → 执行 ----------
    console.log('\n[5] 内部划款全流程');
    const beforeA = await balanceOf(T, accA);
    const beforeB = await balanceOf(T, accB);

    const tr = await api('POST', `/api/transfers?projectId=${P}`, T, {
        fromAccountId: accA, toAccountId: accB, amount: 2000, toAmount: 2000,
        fees: 50, reason: `${TAG}划款`, departmentId: 1,
    });
    assert('创建划款单（camelCase 提交）', tr.status === 201, `-> ${msg(tr)}`);
    const trId = tr?.data?.id;

    assert('划款单待审批时不动余额', await balanceOf(T, accA) === beforeA,
           `期望 ${beforeA}，实际 ${await balanceOf(T, accA)}`);

    // 走完审批链：2000 元匹配「部门主管 → 管理员 ×2 会签」，
    // 三级需要三个不同身份，单用 admin 会卡在第一级（它不是财务部主管）。
    const tokens = {};
    for (const [k, u, pw] of [['mgr', 'testuser', 'user123'], ['admin2', 'phpuser', 'php123']]) {
        const r = await api('POST', '/api/login', '', { username: u, password: pw });
        tokens[k] = r?.data?.token;
    }
    assert('取到部门主管与第二管理员令牌', !!tokens.mgr && !!tokens.admin2);

    for (const who of [tokens.mgr, T, tokens.admin2]) {
        const cur = await api('GET', `/api/transfers/${trId}?projectId=${P}`, T);
        if (cur?.data?.status !== 'pending') break;
        const r = await api('POST', `/api/transfers/${trId}/approve?projectId=${P}`, who, { comment: '同意' });
        if (r.status >= 400) { console.log(`     审批中止: ${msg(r)}`); break; }
    }
    const approved = await api('GET', `/api/transfers/${trId}?projectId=${P}`, T);
    assert('审批后转入待执行', approved?.data?.status === 'to_be_executed', `实际 ${approved?.data?.status}`);

    const exec = await api('POST', `/api/transfers/${trId}/execute?projectId=${P}`, T);
    assert('执行划款', exec.status === 200, `-> ${msg(exec)}`);

    const afterA = await balanceOf(T, accA);
    const afterB = await balanceOf(T, accB);
    assert('转出账户扣减 金额+手续费 = 2050', beforeA - afterA === 2050, `${beforeA} → ${afterA}`);
    assert('转入账户仅增加 2000（不含手续费）', afterB - beforeB === 2000, `${beforeB} → ${afterB}`);

    const dup = await api('POST', `/api/transfers/${trId}/execute?projectId=${P}`, T);
    assert('不可重复执行', dup.status >= 400, `实际 ${dup.status}`);

    // ---------- 6. 划款单列表字段对应 ----------
    console.log('\n[6] 划款列表字段（页面渲染依赖）');
    const list = await api('GET', `/api/transfers?projectId=${P}`, T);
    const row = (list?.data?.transfers || []).find(x => String(x.id) === String(trId));
    assert('列表能取到该划款单', !!row);
    if (row) {
        for (const f of ['fromAccount', 'toAccount', 'fromCurrency', 'toCurrency', 'amount', 'toAmount', 'fees', 'status', 'submitter']) {
            assert(`字段 ${f} 有值`, row[f] !== undefined && row[f] !== null, `实际 ${JSON.stringify(row[f])}`);
        }
        assert('提交时间不含微秒', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.submitTime || ''), row.submitTime);
    }

    // ---------- 7. 同账户划款 ----------
    console.log('\n[7] 业务约束');
    const same = await api('POST', `/api/transfers?projectId=${P}`, T, {
        fromAccountId: accA, toAccountId: accA, amount: 100, departmentId: 1, reason: `${TAG}同账户`,
    });
    assert('转出转入同账户被拒', same.status >= 400 && /相同/.test(msg(same)), `-> ${msg(same)}`);

    // ---------- 8. 并发一致性 ----------
    console.log('\n[8] 并发支出不得把余额扣成负数');
    const cBefore = await balanceOf(T, accA);
    const each = Math.floor(cBefore / 3) + 1000;   // 三笔并发，总额必然超出余额
    const rs = await Promise.all([1, 2, 3].map(i =>
        api('POST', `/api/transactions?projectId=${P}`, T, {
            type: 'expense', amount: each, account_id: accA, subject_id: expenseSub.id,
            description: `${TAG}并发${i}`,
        })));
    const okCount = rs.filter(r => r.status === 201).length;
    const cAfter = await balanceOf(T, accA);
    assert('并发后余额不为负', cAfter >= 0, `余额 ${cAfter}`);
    assert('账面与成功笔数一致', Math.abs((cBefore - okCount * each) - cAfter) < 0.01,
           `前 ${cBefore}，成功 ${okCount} 笔 × ${each}，后 ${cAfter}`);

    console.log(`\n${'='.repeat(52)}`);
    console.log(`交易与划款：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(52));
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('测试异常:', e); process.exit(1); });
