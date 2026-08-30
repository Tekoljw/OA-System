/**
 * 删除语义测试
 *
 * 修复前：BaseRepository::delete 直接返回 execute() 的结果——SQL 执行成功即 true，
 * 删除 0 行同样为 true；配置类路由又丢弃返回值，导致删除不存在的资源
 * 一律返回「删除成功」。并发场景下另一人已删除时，前端仍显示成功，冲突被掩盖。
 *
 * 本用例同时验证：删不到返 404，且正常删除路径未被改坏。
 */
const http = require('http');
const BASE = 'http://localhost:8000';
let passed = 0, failed = 0;
const assert = (n, c, d = '') => c ? (passed++, console.log(`  ✅ ${n}`))
                                   : (failed++, console.log(`  ❌ ${n} ${d}`));
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
const msg = r => r.body?.error?.message || r.body?.message || '';
const P = 1;

async function run() {
    const a = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    const T = a.body?.data?.token;
    assert('管理员登录', !!T);

    // ---- 删除不存在的资源应为 404 ----
    console.log('\n[1] 删除不存在的资源应返回 404，而非「删除成功」');
    for (const [ep, label] of [
        ['account-types', '账户类型'], ['currency-types', '币种'], ['asset-types', '资产类型'],
        ['subjects', '科目'], ['departments', '部门'], ['projects', '项目'],
    ]) {
        const r = await request('DELETE', `/api/${ep}/99999999?projectId=${P}`, null, T);
        assert(`${label} 返回 404`, r.status === 404, `实际 ${r.status} ${msg(r)}`);
        assert(`${label} 不再报成功`, r.body?.success !== true);
    }

    // ---- 正常删除仍然可用（防止改过头）----
    console.log('\n[2] 正常删除路径未被破坏');
    const mk = async (ep, payload) => request('POST', `/api/${ep}?projectId=${P}`, payload, T);

    const sub = await mk('subjects', { name: '删除语义测试科目', code: 'del-sem-1', type: 'income' });
    assert('创建科目', sub.status === 201, `-> ${msg(sub)}`);
    const delSub = await request('DELETE', `/api/subjects/${sub.body?.data?.id}?projectId=${P}`, null, T);
    assert('删除已存在科目返回 200', delSub.status === 200, `实际 ${delSub.status} ${msg(delSub)}`);

    // 二次删除同一条应转为 404 —— 正是并发场景
    const delAgain = await request('DELETE', `/api/subjects/${sub.body?.data?.id}?projectId=${P}`, null, T);
    assert('重复删除同一条返回 404', delAgain.status === 404, `实际 ${delAgain.status}`);

    const at = await mk('asset-types', { name: '删除语义测试资产类型' });
    const delAt = await request('DELETE', `/api/asset-types/${at.body?.data?.id}?projectId=${P}`, null, T);
    assert('删除已存在资产类型返回 200', delAt.status === 200, `实际 ${delAt.status} ${msg(delAt)}`);

    const dept = await mk('departments', { name: '删除语义测试部门' });
    const delDept = await request('DELETE', `/api/departments/${dept.body?.data?.id}?projectId=${P}`, null, T);
    assert('删除已存在部门返回 200', delDept.status === 200, `实际 ${delDept.status} ${msg(delDept)}`);

    // ---- 跨项目删除应视为不存在 ----
    console.log('\n[3] 跨项目删除应视为不存在');
    const sub2 = await mk('subjects', { name: '跨项目删除测试', code: 'del-sem-2', type: 'income' });
    const cross = await request('DELETE', `/api/subjects/${sub2.body?.data?.id}?projectId=8`, null, T);
    assert('用别的项目 id 删不掉', cross.status === 404, `实际 ${cross.status}`);
    const cleanup = await request('DELETE', `/api/subjects/${sub2.body?.data?.id}?projectId=${P}`, null, T);
    assert('回到本项目可正常删除', cleanup.status === 200);

    // ---- 空编码不应互相冲突 ----
    // subjects/currency_types/departments 均有 UNIQUE(code, project_id)，
    // 编码存空串时第二条起必然 duplicate key —— 界面不填编码，等于每项只能建一条
    console.log('\n[4] 不填编码可连续创建多条');
    const made = [];
    for (const i of [1, 2, 3]) {
        const d = await request('POST', `/api/departments?projectId=${P}`, { name: `空码部门${i}` }, T);
        assert(`第${i}个不填编码的部门`, d.status === 201, `-> ${msg(d)}`);
        if (d.body?.data?.id) made.push(['departments', d.body.data.id]);
        const s2 = await request('POST', `/api/subjects?projectId=${P}`, { name: `空码科目${i}`, type: 'income' }, T);
        assert(`第${i}个不填编码的科目`, s2.status === 201, `-> ${msg(s2)}`);
        if (s2.body?.data?.id) made.push(['subjects', s2.body.data.id]);
    }
    // 填了编码时唯一性必须仍然生效
    const u1 = await request('POST', `/api/subjects?projectId=${P}`, { name: '唯一码A', type: 'income', code: 'UNIQ-T1' }, T);
    const u2 = await request('POST', `/api/subjects?projectId=${P}`, { name: '唯一码B', type: 'income', code: 'UNIQ-T1' }, T);
    assert('带编码首次创建成功', u1.status === 201, `-> ${msg(u1)}`);
    assert('相同编码被拒（唯一性未被改坏）', u2.status >= 400, `实际 ${u2.status}`);
    if (u1.body?.data?.id) made.push(['subjects', u1.body.data.id]);

    for (const [ep, id] of made) await request('DELETE', `/api/${ep}/${id}?projectId=${P}`, null, T);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`删除语义：总计 ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    console.log('='.repeat(50));
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('测试异常:', e); process.exit(1); });
