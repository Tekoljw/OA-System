/**
 * 并发下的资金安全：钱不能凭空多出来，账户不能被透支。
 *
 * 这是整个系统最不能出错的一条。余额检查与扣减如果不在同一个事务里、
 * 或者没有对账户行加锁，两笔同时执行的划款都会读到扣减前的余额，
 * 双双通过检查 —— 账户被透支，而且事后从流水上完全看不出异常，
 * 只有对账时才发现余额对不上。
 *
 * 现有套件验的是「一笔划款执行后余额正确」，那是串行路径；
 * 这里专门制造竞争：20 笔同时打进去，只有余额够的那几笔可以成功。
 *
 * 三条断言缺一不可：
 *   1. 成功笔数正好等于余额能支撑的笔数（不能多，多了就是透支）
 *   2. 源账户余额不为负（透支的直接证据）
 *   3. 两个账户余额之和守恒（钱没有凭空增减）
 * 只验第 1 条不够 —— 如果扣减本身有 bug，笔数对了余额照样能错。
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

const TAG = 'CC' + Math.floor(Math.random() * 100000);
const BALANCE = 1000;   // 源账户初始余额
const EACH = 100;       // 每笔划款金额
const COUNT = 20;       // 并发笔数，远多于余额能支撑的 10 笔

(async () => {
    const T = (await api('POST', '/api/login', '', { username: 'admin', password: 'admin123', projectId: PROJECT })).data?.token;
    assert('登录成功', !!T);
    if (!T) process.exit(1);

    const mk = async (name, initial) => (await api('POST', `/api/accounts?projectId=${PROJECT}`, T, {
        name, accountNumber: `${name}-N`, bank: '测试银行',
        limit: 0, currencyType: 'CNY', accountType: 'current', initial_balance: String(initial),
    })).data?.id;

    const src = await mk(`${TAG}源`, BALANCE);
    const dst = await mk(`${TAG}目标`, 0);
    assert('建好两个测试账户', !!src && !!dst);
    if (!src || !dst) process.exit(1);

    console.log(`\n[1] ${COUNT} 笔 × ${EACH} 元同时执行，账户只有 ${BALANCE} 元`);
    const ids = [];
    for (let i = 0; i < COUNT; i++) {
        const r = await api('POST', `/api/transfers?projectId=${PROJECT}`, T, {
            from_account_id: src, to_account_id: dst, amount: String(EACH),
            department_id: 1, description: `${TAG}并发${i}`,
        });
        if (r.data?.id) ids.push(r.data.id);
    }
    assert(`建出 ${COUNT} 张划款单`, ids.length === COUNT, `实际 ${ids.length} 张`);

    // 跳过审批直接推到可执行状态：这里要测的是执行环节的并发，不是审批链
    q(`UPDATE transfers SET status='to_be_executed' WHERE id IN (${ids.join(',')})`);

    // 真并发：一次性全部发出，不等前一笔返回
    const results = await Promise.all(
        ids.map(id => api('PUT', `/api/transfers/${id}/execute?projectId=${PROJECT}`, T))
    );
    const okCount = results.filter(r => r.success === true).length;
    const expected = Math.floor(BALANCE / EACH);

    assert(`成功笔数正好是 ${expected} 笔`, okCount === expected,
           `实际成功 ${okCount} 笔，多出来的就是透支`);

    const srcBal = parseFloat(q(`SELECT balance FROM accounts WHERE id=${src}`));
    const dstBal = parseFloat(q(`SELECT balance FROM accounts WHERE id=${dst}`));
    assert('源账户余额没有变成负数', srcBal >= 0, `余额 ${srcBal}`);
    assert('两账户余额之和守恒', Math.abs((srcBal + dstBal) - BALANCE) < 0.01,
           `${srcBal} + ${dstBal} = ${srcBal + dstBal}，应为 ${BALANCE}`);

    // 失败的那些必须是「余额不足」，而不是死锁、500 之类
    const badReasons = results.filter(r => r.success !== true)
        .map(r => msg(r)).filter(m => !/余额不足/.test(m));
    assert('被拒的都是因为余额不足', badReasons.length === 0,
           `出现了其他错误：${badReasons.slice(0, 2).join(' / ')}`);

    console.log('\n[2] 落账笔数与余额变动一致');
    const txCount = parseInt(q(`SELECT count(*) FROM transactions WHERE account_id=${src} AND type='transfer'`), 10);
    assert(`源账户只产生 ${expected} 笔转出流水`, txCount === expected, `实际 ${txCount} 笔`);

    // 清理：先删引用方（流水、审批）再删被引用方
    q(`DELETE FROM transactions WHERE account_id IN (${src},${dst})`);
    q(`DELETE FROM application_approvals WHERE transfer_id IN (SELECT id FROM transfers WHERE from_account_id=${src} OR to_account_id=${dst})`);
    q(`DELETE FROM transfers WHERE from_account_id IN (${src},${dst}) OR to_account_id IN (${src},${dst})`);
    q(`DELETE FROM activity_logs WHERE description LIKE '%${TAG}%'`);
    q(`DELETE FROM accounts WHERE id IN (${src},${dst})`);

    console.log(`\n并发资金安全：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
