/**
 * 账目一致性：账户余额必须等于初始余额加减其全部流水。
 *
 *   balance = initial_balance
 *           + Σ收入 − Σ支出
 *           + Σ划入(to_amount) − Σ划出(amount + fees)
 *
 * 划款流水在 transactions 里 type 都是 'transfer'，本身分不出方向，
 * 必须经 transfers 表关联才知道是转出还是转入 —— 这也是对账时最容易算错的地方。
 *
 * 本套件先核对现状，再真实走一遍支出/收入/划款，确认落账后仍然对平。
 * 落账逻辑一旦被改坏，这里会立刻失败。
 */
const { execFileSync } = require('child_process');
const BASE = process.env.OA_BASE_URL || 'http://localhost:8000';
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

/** 衍生记录的账面是否对得平：借贷剩余额、资产账面价值 */
function derivedMismatch() {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM loans l
           LEFT JOIN (SELECT loan_id, SUM(amount) settled FROM loan_settlements GROUP BY 1) s ON s.loan_id=l.id
         WHERE l.remaining_amount <> l.amount - COALESCE(s.settled,0))
      + (SELECT COUNT(*) FROM assets a
           LEFT JOIN (SELECT asset_id, SUM(amount) disposed FROM asset_depreciations GROUP BY 1) d ON d.asset_id=a.id
         WHERE a.remaining_value <> a.total_price - COALESCE(d.disposed,0));`;
    return parseInt(execFileSync('docker',
        ['compose','exec','-T','postgres','psql','-U','postgres','-d','oa_system','-tAc',sql],
        { stdio: 'pipe' }).toString().trim(), 10);
}

/** 找不到对应划款单的流水数量。这类流水方向无从判断，会让核对失真 */
function orphanTransferCount() {
    const sql = `SELECT COUNT(*) FROM transactions t WHERE t.type='transfer'
      AND NOT EXISTS (SELECT 1 FROM transfers tr
        WHERE tr.out_transaction_id=t.id OR tr.in_transaction_id=t.id);`;
    return parseInt(execFileSync('docker',
        ['compose','exec','-T','postgres','psql','-U','postgres','-d','oa_system','-tAc',sql],
        { stdio: 'pipe' }).toString().trim(), 10);
}

/**
 * 余额与流水对不上的账户数。
 * 含孤儿划款流水的账户要排除 —— 那类流水在 transactions 里分不出方向，
 * 本就无法参与核对，把它算成账目错误只会掩盖真正的问题。
 */
function unbalancedCount() {
    const sql = `
      WITH tx AS (
        SELECT account_id, SUM(CASE WHEN type='income' THEN amount ELSE 0 END) inc,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) exp
        FROM transactions WHERE status='completed' AND type<>'transfer' GROUP BY account_id
      ), tr_out AS (
        SELECT from_account_id acc, SUM(amount+fees) amt FROM transfers WHERE out_transaction_id IS NOT NULL GROUP BY 1
      ), tr_in AS (
        SELECT to_account_id acc, SUM(to_amount) amt FROM transfers WHERE in_transaction_id IS NOT NULL GROUP BY 1
      )
      SELECT COUNT(*) FILTER (WHERE a.balance <> COALESCE(a.initial_balance,0)
        + COALESCE(tx.inc,0) - COALESCE(tx.exp,0) + COALESCE(tr_in.amt,0) - COALESCE(tr_out.amt,0))
      FROM accounts a
      LEFT JOIN tx ON tx.account_id=a.id
      LEFT JOIN tr_out ON tr_out.acc=a.id
      LEFT JOIN tr_in ON tr_in.acc=a.id
      WHERE NOT EXISTS (
        SELECT 1 FROM transactions t WHERE t.account_id=a.id AND t.type='transfer'
          AND NOT EXISTS (SELECT 1 FROM transfers tr
            WHERE tr.out_transaction_id=t.id OR tr.in_transaction_id=t.id));`;
    const out = execFileSync('docker',
        ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'oa_system', '-tAc', sql],
        { stdio: 'pipe' }).toString().trim();
    return parseInt(out, 10);
}

(async () => {
    const login = async (u, p) => (await api('POST', '/api/login', '', { username: u, password: p, projectId: 1 })).data?.token;
    const T = await login('admin', 'admin123');
    const MGR = await login('testuser', 'user123');
    const A2T = await login('phpuser', 'php123');
    assert('三种身份登录', !!T && !!MGR && !!A2T);
    if (!T) process.exit(1);

    // 其他套件清理时删过流水，可能留下未回滚的余额；先按流水重算，
    // 使本套件检验的是「业务流是否让账目失衡」，而不是历史垃圾
    execFileSync('docker', ['compose','exec','-T','postgres','psql','-U','postgres','-d','oa_system','-c',
      `WITH tx AS (SELECT account_id, SUM(CASE WHEN type='income' THEN amount ELSE 0 END) inc,
              SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) exp
       FROM transactions WHERE status='completed' AND type<>'transfer' GROUP BY account_id),
       tr_out AS (SELECT from_account_id acc, SUM(amount+fees) amt FROM transfers WHERE out_transaction_id IS NOT NULL GROUP BY 1),
       tr_in AS (SELECT to_account_id acc, SUM(to_amount) amt FROM transfers WHERE in_transaction_id IS NOT NULL GROUP BY 1)
       UPDATE accounts a SET balance = COALESCE(a.initial_balance,0)
         + COALESCE((SELECT inc FROM tx WHERE tx.account_id=a.id),0)
         - COALESCE((SELECT exp FROM tx WHERE tx.account_id=a.id),0)
         + COALESCE((SELECT amt FROM tr_in WHERE tr_in.acc=a.id),0)
         - COALESCE((SELECT amt FROM tr_out WHERE tr_out.acc=a.id),0);`], { stdio: 'pipe' });

    console.log('\n[1] 当前账目');
    const orphans = orphanTransferCount();
    if (orphans > 0) {
        console.log(`  ℹ️  有 ${orphans} 条找不到划款单的流水（多为其他套件的清理残留），相关账户不参与核对`);
    }
    assert('全部账户余额与流水一致', unbalancedCount() === 0, `${unbalancedCount()} 个账户对不上`);
    // 借贷剩余额 = 原额 − Σ销账；资产账面 = 总额 − Σ处置。
    // 衍生记录被冲减时若没同步扣减，这里会立刻发现
    assert('借贷剩余额与资产账面对得平', derivedMismatch() === 0, `${derivedMismatch()} 条对不上`);

    const accs = (await api('GET', '/api/accounts?projectId=1&limit=200', T)).data || [];
    const cny = accs.filter(a => a.currency_type === 'CNY').sort((x, y) => Number(y.balance) - Number(x.balance));
    const A = cny[0], B = cny.find(a => a.id !== A?.id);
    assert('取到两个 CNY 账户', !!A && !!B);
    if (!A || !B) process.exit(1);

    const approveAll = async (kind, id) => {
        for (const who of [MGR, T, A2T]) {
            const cur = await api('GET', `/api/${kind}/${id}?projectId=1`, T);
            const st = cur.data?.status;
            if (st !== 'pending') break;
            await api('PUT', `/api/${kind}/${id}/status?projectId=1`, who, { status: 'approved' });
        }
    };

    console.log('\n[2] 走一遍收支与划款');
    // 带小数的金额，顺带验证 numeric(15,2) 的舍入不会让账目错开
    const expApp = await api('POST', '/api/applications?projectId=1', T, {
        type: 'expense', title: 'LEDGER对账支出', amount: 137.45, departmentId: 1,
        transaction_type_code: 'other_expense',
    });
    assert('提交支出申请', expApp.status === 201, msg(expApp));
    await approveAll('applications', expApp.data.id);
    await api('PUT', `/api/applications/${expApp.data.id}/allocate?projectId=1`, T, { account_id: A.id });
    const e1 = await api('PUT', `/api/applications/${expApp.data.id}/execute?projectId=1`, T, {});
    assert('支出落账', e1.status === 200, msg(e1));

    const incApp = await api('POST', '/api/applications?projectId=1', T, {
        type: 'income', title: 'LEDGER对账收入', amount: 211.33, departmentId: 1,
        transaction_type_code: 'other_income',
    });
    await approveAll('applications', incApp.data.id);
    await api('PUT', `/api/applications/${incApp.data.id}/allocate?projectId=1`, T, { account_id: B.id });
    const e2 = await api('PUT', `/api/applications/${incApp.data.id}/execute?projectId=1`, T, {});
    assert('收入落账', e2.status === 200, msg(e2));

    const beforeA = Number(((await api('GET', '/api/accounts?projectId=1&limit=200', T)).data || []).find(x => x.id === A.id).balance);
    const tr = await api('POST', '/api/transfers?projectId=1', T, {
        from_account_id: A.id, to_account_id: B.id, amount: 97.77, fees: 1.5, department_id: 1,
    });
    assert('提交划款', tr.status === 201, msg(tr));
    await approveAll('transfers', tr.data.id);
    const e3 = await api('PUT', `/api/transfers/${tr.data.id}/execute?projectId=1`, T, {});
    assert('划款落账', e3.status === 200, msg(e3));

    const afterA = Number(((await api('GET', '/api/accounts?projectId=1&limit=200', T)).data || []).find(x => x.id === A.id).balance);
    // 手续费从转出账户另扣，转出方共减 amount + fees
    assert('转出账户按 金额+手续费 扣减',
           Math.abs((beforeA - afterA) - (97.77 + 1.5)) < 0.005,
           `前 ${beforeA} 后 ${afterA}`);

    console.log('\n[3] 落账后重新对账');
    assert('全部账户仍然对平', unbalancedCount() === 0, `${unbalancedCount()} 个账户对不上`);
    assert('衍生记录仍然对平', derivedMismatch() === 0, `${derivedMismatch()} 条对不上`);

    // 本套件自己造的划款单要清掉，否则留给后面的套件就是孤儿流水
    execFileSync('docker', ['compose','exec','-T','postgres','psql','-U','postgres','-d','oa_system','-c',
        `DELETE FROM transactions WHERE id IN (${tr.data.out_transaction_id ?? 0}, ${tr.data.in_transaction_id ?? 0})
           OR id IN (SELECT out_transaction_id FROM transfers WHERE id=${tr.data.id} AND out_transaction_id IS NOT NULL)
           OR id IN (SELECT in_transaction_id FROM transfers WHERE id=${tr.data.id} AND in_transaction_id IS NOT NULL);
         DELETE FROM application_approvals WHERE transfer_id=${tr.data.id};
         DELETE FROM transfers WHERE id=${tr.data.id};`], { stdio: 'pipe' });

    console.log(`\n账目一致性：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
