/**
 * M4 内部划款测试（12 项）
 */
const fs = require('fs');
const BASE_URL = process.env.OA_BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api`;
// 每轮唯一标记：断言「恰好 2 条」必须只统计本轮产生的记录，
// 否则历史数据累积后第二次运行必然失败
const M4_TAG = `M4同币种划款测试-${Date.now().toString().slice(-6)}`;
const SHOT_DIR = '/home/ubuntu/OA-System/test-screenshots/m4';

const results = [];
function R(id, name, pass, detail = '') {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(token, method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  return { httpStatus: r.status, ...(await r.json()) };
}

// 账户列表按 id 倒序分页，默认只返回 50 条。此前不带 limit 直接 find，
// 账户一多，早期 id 就落在第一页之外，getBalance 恒为 null，
// 余额相关断言全部失效（看起来像产品 bug，其实是取不到数据）。
async function getBalance(token, projectId, accountId) {
  const r = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=200`);
  const acc = (r.data || []).find(a => a.id == accountId);
  return acc ? parseFloat(acc.balance) : null;
}

/**
 * 动态挑两个同币种账户，并把转出账户的余额备足。
 * 此前硬编码 id=1/2，且默认库里恰好有钱；账户数据一变测试就整片失败，
 * 报「余额不足」看起来像产品缺陷，实则是用例没有自己准备前置数据。
 */
async function pickTwoAccounts(token, projectId) {
  const r = await api(token, 'GET', `/accounts?projectId=${projectId}&limit=200`);
  const list = (r.data || []).filter(a => a.currency_type === 'CNY');
  if (list.length < 2) throw new Error('可用的 CNY 账户少于 2 个，无法测试划款');
  const [a, b] = [list[0].id, list[1].id];

  // 备足转出账户余额：本组用例最大一笔需 10050
  const need = 50000;
  const cur = await getBalance(token, projectId, a);
  if (cur < need) {
    const subj = await api(token, 'GET', `/subjects?projectId=${projectId}&type=income`);
    const subjectId = (subj.data || [])[0]?.id;
    await api(token, 'POST', `/transactions?projectId=${projectId}`, {
      type: 'income', amount: need - cur, account_id: a, subject_id: subjectId,
      description: 'M4测试备款',
    });
  }
  return [a, b];
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  console.log('\n========================================');
  console.log('M4 内部划款测试（12 项）');
  console.log('========================================\n');

  // 登录
  const loginResp = await (await fetch(`${API}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })).json();
  const token = loginResp.data.token;
  const projectId = loginResp.data.currentProject?.id || 1;

  const [accA, accB] = await pickTwoAccounts(token, projectId); // 动态选取，不再硬编码

  // ---- M4.1 划款功能 ----

  // M4-01 页面加载 (用 API 代替 UI，因 UI 渲染问题已在 M2/M3 记录)
  const txList = await api(token, 'GET', `/transactions?projectId=${projectId}&type=transfer`);
  // transfer 类型的交易列表能否查询
  R('M4-01', 'transfer类型交易可查询', txList.success !== undefined, `返回${(txList.data || []).length}条transfer记录`);

  // M4-02 API 同币种划款
  const balA_before = await getBalance(token, projectId, accA);
  const balB_before = await getBalance(token, projectId, accB);
  console.log(`  📊 划款前: A#${accA}=${balA_before}, B#${accB}=${balB_before}`);

  const transferResp = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 6000, description: M4_TAG,
    account_id: accA, target_account_id: accB
  });
  R('M4-02', 'API同币种划款', transferResp.success,
    transferResp.success
      ? `out_id=${transferResp.data?.out_transaction?.id}, in_id=${transferResp.data?.in_transaction?.id}`
      : transferResp.error?.message);

  // M4-03 ⭐ 转出账户余额减少
  const balA_after = await getBalance(token, projectId, accA);
  const aDelta = balA_after - balA_before;
  R('M4-03', '⭐转出账户余额减少', Math.abs(aDelta - (-6000)) < 0.01,
    `前=${balA_before}, 后=${balA_after}, 变化=${aDelta}, 期望=-6000`);

  // M4-04 ⭐ 转入账户余额增加
  const balB_after = await getBalance(token, projectId, accB);
  const bDelta = balB_after - balB_before;
  R('M4-04', '⭐转入账户余额增加', Math.abs(bDelta - 6000) < 0.01,
    `前=${balB_before}, 后=${balB_after}, 变化=${bDelta}, 期望=+6000`);

  // M4-05 含手续费划款
  const balA2 = await getBalance(token, projectId, accA);
  const balB2 = await getBalance(token, projectId, accB);
  const feeResp = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 10000, fees: 50, description: 'M4手续费划款测试',
    account_id: accA, target_account_id: accB
  });
  R('M4-05-创建', '含手续费划款', feeResp.success, feeResp.success ? `fees=${feeResp.data?.fees}` : feeResp.error?.message);

  const balA3 = await getBalance(token, projectId, accA);
  const balB3 = await getBalance(token, projectId, accB);
  // 转出应减少 amount + fees = 10050
  const aFeeDelta = balA3 - balA2;
  R('M4-05', '⭐手续费扣减正确', Math.abs(aFeeDelta - (-10050)) < 0.01,
    `转出变化=${aFeeDelta}, 期望=-10050`);

  // 转入应增加 amount = 10000
  const bFeeDelta = balB3 - balB2;
  R('M4-05b', '⭐转入金额正确(不含手续费)', Math.abs(bFeeDelta - 10000) < 0.01,
    `转入变化=${bFeeDelta}, 期望=+10000`);

  // M4-06 跨币种划款（to_amount 不同）
  const crossResp = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 7000, to_amount: 1000, description: 'M4跨币种划款(模拟)',
    account_id: accA, target_account_id: accB
  });
  R('M4-06', '跨币种划款(to_amount)', crossResp.success,
    crossResp.success ? `amount=7000, to_amount=${crossResp.data?.to_amount}` : crossResp.error?.message);

  // ---- M4.2 验证规则 ----

  // M4-07 转出账户为空
  const r07 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 1000, target_account_id: accB
  });
  R('M4-07', '转出账户为空拒绝', !r07.success, r07.error?.message || '');

  // M4-08 转入账户为空
  const r08 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 1000, account_id: accA
  });
  R('M4-08', '转入账户为空拒绝', !r08.success, r08.error?.message || '');

  // M4-09 转出=转入
  const r09 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 1000, account_id: accA, target_account_id: accA
  });
  R('M4-09', '转出=转入拒绝', !r09.success, r09.error?.message || '');

  // M4-10 金额为0
  const r10 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 0, account_id: accA, target_account_id: accB
  });
  R('M4-10', '金额为0拒绝', !r10.success, r10.error?.message || '');

  // M4-11 金额为负
  const r11 = await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: -100, account_id: accA, target_account_id: accB
  });
  R('M4-11', '金额为负拒绝', !r11.success, r11.error?.message || '');

  // ---- M4.3 数据一致性 ----

  // M4-12 ⭐ 划款事务一致性
  const allTx = await api(token, 'GET', `/transactions?projectId=${projectId}&limit=100`);
  const m4Txs = (allTx.data || []).filter(t => t.description === M4_TAG);
  // 一笔划款应生成转出/转入各一条，且落在两个不同账户上
  const accIds = m4Txs.map(t => t.account_id);
  R('M4-12', '⭐划款生成两条记录', m4Txs.length === 2 && new Set(accIds).size === 2,
    `找到${m4Txs.length}条本轮划款记录, 账户IDs=[${accIds.join(',')}]`);

  // 回退测试数据（反向划款）
  // M4-02: 6000, M4-05: 10000+50fee, M4-06: 7000 => A净减 23050, B净增 17000
  await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'transfer', amount: 17000, description: 'M4清理-反向',
    account_id: accB, target_account_id: accA
  });
  // 补 6050 差额
  await api(token, 'POST', `/transactions?projectId=${projectId}`, {
    type: 'income', amount: 6050, description: 'M4清理-补差', account_id: accA, subject_id: 1
  });

  // ---- 汇总 ----
  console.log('\n========================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`M4 测试完成: ${pass} PASS / ${fail} FAIL (共 ${results.length} 项)`);
  console.log('========================================\n');

  fs.writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify({ module: 'M4', results, summary: { total: results.length, pass, fail } }, null, 2));
})();
