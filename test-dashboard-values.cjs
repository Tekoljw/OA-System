/**
 * 仪表盘上的每个数字，都必须等于按明细独立算出来的值。
 *
 * 为什么单列一个套件：此前三个饼图从来没画出过数据（服务端给
 * subject_name/total，Recharts 要 name/value，字段名对不上），
 * 交易摘要的六个数字长期恒为 0（服务端返回数组，前端读 rawData.daily?.income
 * 兜底成 0），而 19 个回归套件全绿 —— 因为它们只验「接口返回 200」
 * 和「页面没白屏」。数字是假的，测试完全看不出来。
 *
 * 所以这里不查接口状态码，只做一件事：拿服务端给仪表盘的数，
 * 跟直接从 transactions/accounts 明细算出来的数逐项比对。
 * 跨币种一律折算成 USD 锚点后再比 —— 把 CNY 和 USD 直接相加得到的数
 * 既不是人民币也不是美元，这正是之前踩过的坑。
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

/** 直接查库，作为独立于被测代码的对照基准 */
function q(sql) {
    return execFileSync('docker',
        ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'oa_system', '-tAc', sql],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

const near = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;

(async () => {
    const T = (await api('POST', '/api/login', '', { username: 'admin', password: 'admin123', projectId: PROJECT })).data?.token;
    assert('登录成功', !!T);
    if (!T) process.exit(1);

    // 汇率表：把任意币种折算成 USD 锚点
    const rateRows = q(`SELECT code||'='||COALESCE(rate_to_usd::text,'') FROM currency_types WHERE project_id=${PROJECT}`)
        .split('\n').filter(Boolean);
    const rates = {};
    for (const r of rateRows) {
        const [code, v] = r.split('=');
        if (v) rates[code] = parseFloat(v);
    }
    const toUsd = (amount, cur) => {
        const rate = rates[cur];
        return rate == null ? null : Number(amount) * rate;
    };
    assert('取到汇率表', Object.keys(rates).length > 0);

    console.log('\n[1] 账户摘要 = 账户余额明细');
    const dash = await api('GET', `/api/dashboard?projectId=${PROJECT}`, T);
    const summary = dash.data?.accountSummary || [];
    assert('accountSummary 带币种字段', summary.length > 0 && summary.every(r => !!r.currency_type),
           JSON.stringify(summary[0] || {}));

    for (const row of summary) {
        const real = q(`SELECT COALESCE(sum(balance),0) FROM accounts
                        WHERE project_id=${PROJECT} AND status='active' AND currency_type='${row.currency_type}'`);
        assert(`${row.currency_type} 余额合计与明细一致`,
               near(row.total_balance, real), `接口 ${row.total_balance} / 明细 ${real}`);
    }

    console.log('\n[2] 交易摘要 = 当日/当月流水明细');
    const tx = await api('GET', `/api/dashboard/transactions?projectId=${PROJECT}`, T);
    const daily = tx.data?.daily, monthly = tx.data?.monthly;
    // 结构必须是 {daily:[], monthly:[]}：前端按这个结构读，返回数组会被
    // rawData.daily?.income 静默兜底成 0，六个数字全变 0.00 而测试无感
    assert('返回 daily / monthly 两组', Array.isArray(daily) && Array.isArray(monthly),
           JSON.stringify(tx.data).slice(0, 120));

    for (const [scope, rows, cond] of [
        ['当日', daily,   `t.transaction_date = CURRENT_DATE`],
        ['当月', monthly, `t.transaction_date >= date_trunc('month', CURRENT_DATE)`],
    ]) {
        if (!Array.isArray(rows)) continue;
        assert(`${scope}数据带币种字段`, rows.length === 0 || rows.every(r => 'currency_type' in r),
               JSON.stringify(rows[0] || {}));
        for (const type of ['income', 'expense']) {
            const apiTotal = rows.filter(r => r.type === type)
                .reduce((s, r) => s + (toUsd(r.total, r.currency_type) ?? 0), 0);
            const detail = q(`SELECT COALESCE(a.currency_type,'')||':'||COALESCE(sum(t.amount),0)
                              FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id
                              WHERE t.project_id=${PROJECT} AND t.status='completed'
                                AND t.type='${type}' AND ${cond}
                              GROUP BY a.currency_type`);
            const realTotal = detail.split('\n').filter(Boolean).reduce((s, line) => {
                const [cur, amt] = line.split(':');
                return s + (toUsd(amt, cur) ?? 0);
            }, 0);
            assert(`${scope}${type === 'income' ? '收入' : '支出'}折算后与明细一致`,
                   near(apiTotal, realTotal, 0.05),
                   `接口 ${apiTotal.toFixed(2)} / 明细 ${realTotal.toFixed(2)}`);
        }
    }

    console.log('\n[3] 科目 / 部门统计 = 流水明细');
    for (const [label, key, nameKey, type] of [
        ['收入按科目', 'incomeBySubject',     'subject_name',    'income'],
        ['支出按科目', 'expenseBySubject',    'subject_name',    'expense'],
        ['支出按部门', 'expenseByDepartment', 'department_name', 'expense'],
    ]) {
        const rows = dash.data?.[key] || [];
        // 带币种是前端能正确折算的前提；不带就等于把不同币种直接相加
        assert(`${label} 带币种字段`, rows.length === 0 || rows.every(r => 'currency_type' in r),
               JSON.stringify(rows[0] || {}));
        // 图表要的是 name/value，这里只保证服务端字段齐全，前端映射由渲染断言覆盖
        assert(`${label} 带分组名与金额`, rows.length === 0 || rows.every(r => r[nameKey] != null && r.total != null));

        const apiTotal = rows.reduce((s, r) => s + (toUsd(r.total, r.currency_type) ?? 0), 0);
        const detail = q(`SELECT COALESCE(a.currency_type,'')||':'||COALESCE(sum(t.amount),0)
                          FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id
                          WHERE t.project_id=${PROJECT} AND t.status='completed' AND t.type='${type}'
                            AND t.transaction_date >= date_trunc('month', CURRENT_DATE)
                          GROUP BY a.currency_type`);
        const realTotal = detail.split('\n').filter(Boolean).reduce((s, line) => {
            const [cur, amt] = line.split(':');
            return s + (toUsd(amt, cur) ?? 0);
        }, 0);
        // 合计必须等于该类型全部流水：分组口径漏掉一类（比如没有科目的
        // 股东入资、还款）会让图表少一块，而单看图表完全正常
        assert(`${label} 合计等于当月${type === 'income' ? '收入' : '支出'}总额`,
               near(apiTotal, realTotal, 0.05),
               `分组合计 ${apiTotal.toFixed(2)} / 总额 ${realTotal.toFixed(2)}`);
    }

    console.log(`\n仪表盘数值：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
