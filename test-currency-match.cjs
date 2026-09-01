/**
 * 归账账户币种必须与申请单一致。
 *
 * 不校验的话，一笔 100 USD 的申请归到人民币账户会原样加 100 元 ——
 * 金额不换算、不报错，账目从此对不上。这是资金记账的硬约束，单列一个套件守住。
 */
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

(async () => {
    const login = async (u, p) => (await api('POST', '/api/login', '', { username: u, password: p, projectId: 1 })).data?.token;
    const T = await login('admin', 'admin123');
    const MGR = await login('testuser', 'user123');
    const A2 = await login('phpuser', 'php123');
    assert('三种身份登录', !!T && !!MGR && !!A2);
    if (!T) process.exit(1);

    const accs = (await api('GET', '/api/accounts?projectId=1&limit=200', T)).data || [];
    const usd = accs.find(a => a.currency_type === 'USD');
    const cny = accs.find(a => a.currency_type === 'CNY');
    assert('取到 USD 与 CNY 账户', !!usd && !!cny);
    if (!usd || !cny) process.exit(1);

    const cnyBefore = Number(cny.balance);

    const app = await api('POST', '/api/applications?projectId=1', T, {
        type: 'income', title: 'CURMATCH币种校验', amount: 100, currency_type: 'USD',
        departmentId: 1, transaction_type_code: 'other_income',
    });
    assert('提交 100 USD 收款申请', app.status === 201, msg(app));
    const id = app.data?.id;
    if (!id) process.exit(1);

    // 逐个身份推进审批链
    for (const who of [MGR, T, A2]) {
        const cur = await api(`GET`, `/api/applications/${id}?projectId=1`, T);
        if (cur.data?.status !== 'pending') break;
        await api('PUT', `/api/applications/${id}/status?projectId=1`, who, { status: 'approved' });
    }

    const bad = await api('PUT', `/api/applications/${id}/allocate?projectId=1`, T, { account_id: cny.id });
    assert('归账到币种不符的账户被拒', bad.status >= 400 && /不一致/.test(msg(bad)), msg(bad));

    // 绕过归账直接执行也必须被挡住
    const badExec = await api('PUT', `/api/applications/${id}/execute?projectId=1`, T, { account_id: cny.id });
    assert('跳过归账直接执行同样被拒', badExec.status >= 400 && /不一致/.test(msg(badExec)), msg(badExec));

    const after = ((await api('GET', '/api/accounts?projectId=1&limit=200', T)).data || [])
        .find(a => a.id === cny.id);
    assert('CNY 账户余额未被改动', Number(after.balance) === cnyBefore,
           `前 ${cnyBefore} 后 ${after?.balance}`);

    const ok = await api('PUT', `/api/applications/${id}/allocate?projectId=1`, T, { account_id: usd.id });
    assert('归账到同币种账户通过', ok.status === 200, msg(ok));
    const exec = await api('PUT', `/api/applications/${id}/execute?projectId=1`, T, {});
    assert('执行成功', exec.status === 200, msg(exec));

    const usdAfter = ((await api('GET', '/api/accounts?projectId=1&limit=200', T)).data || [])
        .find(a => a.id === usd.id);
    assert('USD 账户余额精确增加 100',
           Number(usdAfter.balance) === Number(usd.balance) + 100,
           `前 ${usd.balance} 后 ${usdAfter?.balance}`);

    console.log(`\n币种一致性：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
