/**
 * 开关类操作必须真的落库 —— 不能只看接口返回成功。
 *
 * 为什么单列一个套件：界面上「停用用户」发的是 {active:false}，而服务端
 * 字段白名单只认 is_active，字段被整个滤掉，请求以「无有效的可修改字段」
 * 失败；界面只弹一句「错误」，管理员以为把人停用了，对方照样能登录。
 * 19 个回归套件全绿 —— 因为没有一个套件在改完之后回读过数据库。
 *
 * 所以这里每个用例都是同一个套路：调接口 → 回读数据库 → 确认值真的变了 →
 * 再确认业务效果（比如被停用的账号确实登不进来）。
 * 前后端字段名对不上是本项目反复出现的一类缺陷，这个套件专门守住它。
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

const TAG = 'TG' + Math.floor(Math.random() * 100000);

(async () => {
    const T = (await api('POST', '/api/login', '', { username: 'admin', password: 'admin123', projectId: PROJECT })).data?.token;
    assert('登录成功', !!T);
    if (!T) process.exit(1);

    console.log('\n[1] 停用 / 启用用户');
    const created = await api('POST', `/api/users?projectId=${PROJECT}`, T, {
        username: TAG.toLowerCase(), password: 'toggle123456',
        fullName: `${TAG}开关测试`, role: 'user', departmentId: 1,
    });
    assert('建测试用户', created.status === 201 || created.success, msg(created));
    const uid = created.data?.id;
    if (!uid) { console.log('\n开关落库：无法建用户，中止'); process.exit(1); }

    const disable = await api('PUT', `/api/users/${uid}?projectId=${PROJECT}`, T, { is_active: false });
    assert('停用请求成功', disable.success === true, msg(disable));
    // 关键：回读数据库。接口返回成功但字段被白名单滤掉时，这里才看得出来
    assert('停用已落库', q(`SELECT is_active FROM users WHERE id=${uid}`) === 'f',
           `库中仍为 ${q(`SELECT is_active FROM users WHERE id=${uid}`)}`);
    // 再确认业务效果：停用不生效的话，被停的人照样能登录
    const blocked = await api('POST', '/api/login', '', { username: TAG.toLowerCase(), password: 'toggle123456' });
    assert('被停用的账号无法登录', blocked.success !== true, '竟然登录成功');

    const enable = await api('PUT', `/api/users/${uid}?projectId=${PROJECT}`, T, { is_active: true });
    assert('启用请求成功', enable.success === true, msg(enable));
    assert('启用已落库', q(`SELECT is_active FROM users WHERE id=${uid}`) === 't');
    const ok = await api('POST', '/api/login', '', { username: TAG.toLowerCase(), password: 'toggle123456' });
    assert('恢复后可以登录', ok.success === true, msg(ok));

    console.log('\n[2] 账户启用 / 停用');
    const acc = await api('POST', `/api/accounts?projectId=${PROJECT}`, T, {
        name: `${TAG}账户`, accountNumber: `${TAG}-01`, bank: '测试银行',
        limit: 0, currencyType: 'CNY', accountType: 'current',
    });
    assert('建测试账户', acc.success === true, msg(acc));
    const aid = acc.data?.id;
    if (aid) {
        const off = await api('PUT', `/api/accounts/${aid}?projectId=${PROJECT}`, T, { status: 'inactive' });
        assert('停用账户请求成功', off.success === true, msg(off));
        assert('账户状态已落库', q(`SELECT status FROM accounts WHERE id=${aid}`) === 'inactive',
               `库中为 ${q(`SELECT status FROM accounts WHERE id=${aid}`)}`);
        // 停用的账户不能再参与划款，这是停用真正要达到的效果
        const other = q(`SELECT id FROM accounts WHERE project_id=${PROJECT} AND status='active'
                         AND currency_type='CNY' AND id<>${aid} LIMIT 1`);
        if (other) {
            const tr = await api('POST', `/api/transfers?projectId=${PROJECT}`, T, {
                from_account_id: Number(aid), to_account_id: Number(other),
                amount: '1', department_id: 1, description: `${TAG}停用账户划款`,
            });
            assert('停用的账户不能用于划款', tr.success !== true, '竟然允许划款');
        }
        const on = await api('PUT', `/api/accounts/${aid}?projectId=${PROJECT}`, T, { status: 'active' });
        assert('启用账户请求成功', on.success === true, msg(on));
        assert('账户恢复已落库', q(`SELECT status FROM accounts WHERE id=${aid}`) === 'active');
    }

    console.log('\n[3] 汇率的自动获取开关');
    const rates = (await api('GET', `/api/exchange-rates?projectId=${PROJECT}`, T)).data || [];
    const cny = rates.find(r => r.code === 'CNY');
    if (cny) {
        const before = q(`SELECT auto_fetch FROM currency_types WHERE id=${cny.id}`);
        const toggled = before === 't' ? false : true;
        const r1 = await api('PUT', `/api/exchange-rates/${cny.id}?projectId=${PROJECT}`, T, { autoFetch: toggled });
        assert('切换自动获取请求成功', r1.success === true, msg(r1));
        assert('自动获取开关已落库',
               q(`SELECT auto_fetch FROM currency_types WHERE id=${cny.id}`) === (toggled ? 't' : 'f'));
        // 还原，避免影响其他套件对汇率有效期的判断
        await api('PUT', `/api/exchange-rates/${cny.id}?projectId=${PROJECT}`, T, { autoFetch: before === 't' });
        assert('已还原为原值', q(`SELECT auto_fetch FROM currency_types WHERE id=${cny.id}`) === before);
    }

    // 清理：先删引用方再删被引用方，否则撞外键
    q(`DELETE FROM activity_logs WHERE description LIKE '%${TAG}%'`);
    q(`DELETE FROM accounts WHERE name LIKE '${TAG}%'`);
    q(`DELETE FROM user_projects WHERE user_id=${uid}`);
    q(`DELETE FROM users WHERE id=${uid}`);

    console.log(`\n开关落库：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
