/**
 * 划款的币种与汇率约束。
 *
 * 同币种：到账额只能是「转出额 − 手续费」，不存在汇率与汇兑损益。
 * 跨币种：必须给出实际到账额，官方汇率由系统汇率算出，差额记为汇兑损益；
 *         任一币种汇率失效则直接拒绝 —— 用失效汇率算出的损益看起来像真的，比不记更糟。
 */
const BASE = process.env.OA_BASE_URL || 'http://localhost:8000';
const { execFileSync } = require('child_process');
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
const sql = q => { try { execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'oa_system', '-c', q], { stdio: 'pipe' }); } catch { /* 环境无 docker 时跳过失效场景 */ } };

(async () => {
    const T = (await api('POST', '/api/login', '', { username: 'admin', password: 'admin123', projectId: 1 })).data?.token;
    assert('管理员登录', !!T);
    if (!T) process.exit(1);

    // 翻页取全量再挑，不能只看第一页：整跑时前面的套件会消耗掉靠前那些
    // 账户的余额，「前 200 个里有 2 个余额 >2000 的 CNY 账户」这个前提
    // 随执行顺序而变 —— 单独跑通过、整跑却挂在第一条断言上。
    const accs = [];
    for (let page = 1; page <= 20; page++) {
        const rows = (await api('GET', `/api/accounts?projectId=1&limit=200&page=${page}`, T)).data || [];
        accs.push(...rows);
        if (rows.length < 200) break;
    }
    const cny = accs.filter(a => a.currency_type === 'CNY' && a.status === 'active' && Number(a.balance) > 2000).slice(0, 2);
    const usd = accs.find(a => a.currency_type === 'USD' && a.status === 'active');
    assert('取到两个 CNY 账户和一个 USD 账户', cny.length === 2 && !!usd);
    if (cny.length < 2 || !usd) process.exit(1);

    const mk = (body) => api('POST', '/api/transfers?projectId=1', T, { department_id: 1, ...body });

    // ---- 同币种 ----
    console.log('\n[1] 同币种');
    // 手续费从转出账户另扣，不影响到账额
    const same = await mk({ from_account_id: cny[0].id, to_account_id: cny[1].id, amount: 1000, fees: 10 });
    assert('不填到账额时自动等于转出金额', same.status === 201 && Number(same.data?.toAmount) === 1000,
           `${same.data?.toAmount ?? msg(same)}`);
    assert('同币种不产生汇率', same.data?.officialExchangeRate == null && same.data?.actualExchangeRate == null);
    assert('同币种汇兑损益为 0', Number(same.data?.exchangeLoss) === 0);

    const tampered = await mk({ from_account_id: cny[0].id, to_account_id: cny[1].id, amount: 1000, fees: 10, to_amount: 1500 });
    assert('同币种自填不一致的到账额被拒', tampered.status >= 400 && /必须等于转出金额/.test(msg(tampered)), msg(tampered));

    // ---- 跨币种 ----
    console.log('\n[2] 跨币种');
    const noAmount = await mk({ from_account_id: cny[0].id, to_account_id: usd.id, amount: 1000, fees: 0 });
    assert('跨币种不填到账额被拒', noAmount.status >= 400 && /必须填写实际到账金额/.test(msg(noAmount)), msg(noAmount));

    const rates = (await api('GET', '/api/exchange-rates?projectId=1', T)).data || [];
    const rateOf = c => rates.find(x => x.code === c);
    const expectRate = rateOf('CNY')?.rateToUsd / rateOf('USD')?.rateToUsd;

    const cross = await mk({ from_account_id: cny[0].id, to_account_id: usd.id, amount: 1000, fees: 0, to_amount: 140 });
    assert('跨币种划款可提交', cross.status === 201, msg(cross));
    assert('官方汇率取自系统汇率',
           Math.abs(Number(cross.data?.officialExchangeRate) - expectRate) < 1e-6,
           `${cross.data?.officialExchangeRate} vs ${expectRate}`);
    assert('实际汇率按到账额倒推', Math.abs(Number(cross.data?.actualExchangeRate) - 0.14) < 1e-6,
           `${cross.data?.actualExchangeRate}`);
    assert('汇兑损益 = 官方应得 − 实收',
           Math.abs(Number(cross.data?.exchangeLoss) - (Math.round(1000 * expectRate * 100) / 100 - 140)) < 0.02,
           `${cross.data?.exchangeLoss}`);

    // ---- 汇率失效 ----
    console.log('\n[3] 汇率失效');
    sql("UPDATE currency_types SET auto_fetch=FALSE, valid_hours=1, rate_updated_at=NOW()-INTERVAL '5 hours' WHERE code='CNY';");
    const expired = await mk({ from_account_id: cny[0].id, to_account_id: usd.id, amount: 1000, fees: 0, to_amount: 140 });
    assert('汇率失效时跨币种划款被拒', expired.status >= 400 && /汇率已失效/.test(msg(expired)), msg(expired));

    const sameStillOk = await mk({ from_account_id: cny[0].id, to_account_id: cny[1].id, amount: 100, fees: 0 });
    assert('汇率失效不影响同币种划款', sameStillOk.status === 201, msg(sameStillOk));
    sql("UPDATE currency_types SET auto_fetch=TRUE, valid_hours=24 WHERE code='CNY';");

    console.log(`\n划款币种与汇率：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
