/**
 * 业务逻辑边界测试 — 查找隐藏的 Bug
 */
const fs = require('fs');
const BASE_URL = process.env.OA_BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api`;

const results = [];
const bugs = [];
function R(id, name, pass, detail = '', bugInfo = null) {
  results.push({ id, name, status: pass ? 'PASS' : 'BUG', detail });
  if (!pass && bugInfo) bugs.push({ id, name, ...bugInfo });
  console.log(`${pass ? '✅' : '🐛'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(token, method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  return { httpStatus: r.status, ...(await r.json()) };
}

async function getBalance(token, pId, accId) {
  const r = await api(token, 'GET', `/accounts?projectId=${pId}&limit=500`);
  const a = (r.data || []).find(x => x.id == accId);
  return a ? parseFloat(a.balance) : null;
}

(async () => {
  console.log('\n========================================');
  console.log('业务逻辑边界与漏洞测试');
  console.log('========================================\n');

  const loginResp = await (await fetch(`${API}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })).json();
  const token = loginResp.data.token;
  const pId = loginResp.data.currentProject?.id || 1;

  // ============================================================
  // 1. 余额透支测试
  // ============================================================
  console.log('--- 1. 余额透支测试 ---\n');

  // 创建一个小余额账户
  const smallAcc = await api(token, 'POST', `/accounts?projectId=${pId}&limit=500`, {
    name: '透支测试户', account_type: '活期', currency_type: 'CNY',
    account_number: 'EDGE-001', initial_balance: 100, balance: 100
  });
  const smallAccId = smallAcc.data?.id;

  // 尝试支出超过余额
  const overdraft = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'expense', amount: 999999, description: '透支测试',
    account_id: smallAccId, subject_id: 1
  });
  const balAfterOverdraft = await getBalance(token, pId, smallAccId);
  R('E-01', '支出超过余额（透支）', !overdraft.success || balAfterOverdraft >= 0,
    `余额100支出999999: success=${overdraft.success}, 余额=${balAfterOverdraft}`,
    { severity: '高', desc: `账户允许透支为负数（余额=${balAfterOverdraft}）。财务系统应校验余额充足性，或至少有透支预警。` });

  // 划款超过余额
  const overdraftTransfer = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'transfer', amount: 999999, account_id: smallAccId, target_account_id: 1,
    description: '划款透支测试'
  });
  const balAfterTransferOD = await getBalance(token, pId, smallAccId);
  R('E-02', '划款超过余额（透支）', !overdraftTransfer.success || balAfterTransferOD >= 0,
    `划款999999: success=${overdraftTransfer.success}, 余额=${balAfterTransferOD}`,
    { severity: '高', desc: `内部划款允许透支（余额=${balAfterTransferOD}），应校验转出账户余额充足。` });

  // 清理
  if (smallAccId) await api(token, 'DELETE', `/accounts/${smallAccId}?projectId=${pId}`);

  // ============================================================
  // 2. 交易编辑/删除
  // ============================================================
  console.log('\n--- 2. 交易编辑/删除 ---\n');

  // 创建一笔交易
  const testTx = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'income', amount: 500, description: '编辑删除测试',
    account_id: 1, subject_id: 1
  });
  const txId = testTx.data?.id;

  // 尝试 PUT 修改交易
  const editTx = await api(token, 'PUT', `/transactions/${txId}?projectId=${pId}`, {
    amount: 999, description: '已篡改金额'
  });
  R('E-03', '交易不可编辑(PUT)', !editTx.success || editTx.httpStatus === 405,
    `PUT /transactions/${txId}: status=${editTx.httpStatus}, success=${editTx.success}`,
    editTx.success ? { severity: '高', desc: '交易记录可以被 PUT 修改金额，财务系统中已完成的交易不应允许直接修改。' } : null);

  // 尝试 DELETE 删除交易
  const delTx = await api(token, 'DELETE', `/transactions/${txId}?projectId=${pId}`);
  R('E-04', '交易不可删除(DELETE)', !delTx.success || delTx.httpStatus === 405,
    `DELETE /transactions/${txId}: status=${delTx.httpStatus}, success=${delTx.success}`,
    delTx.success ? { severity: '高', desc: '交易记录可被直接 DELETE 删除，财务系统应禁止删除或仅支持冲红/作废操作。' } : null);

  // 回退余额
  await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'expense', amount: 500, description: '清理', account_id: 1, subject_id: 1
  });

  // ============================================================
  // 3. 金额精度
  // ============================================================
  console.log('\n--- 3. 金额精度 ---\n');

  const precTx = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'income', amount: 0.01, description: '最小金额测试',
    account_id: 1, subject_id: 1
  });
  R('E-05', '最小金额0.01', precTx.success, `success=${precTx.success}`);

  const largeTx = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'income', amount: 99999999999, description: '超大金额测试',
    account_id: 1, subject_id: 1
  });
  R('E-06', '超大金额处理', largeTx.success !== undefined,
    `success=${largeTx.success}, amount=${largeTx.data?.amount || 'N/A'}`,
    largeTx.success ? { severity: '中', desc: `允许创建超大金额交易(${largeTx.data?.amount})，应设置合理的金额上限。` } : null);

  // 回退
  if (precTx.success) await api(token, 'POST', `/transactions?projectId=${pId}`, { type: 'expense', amount: 0.01, description: '清理', account_id: 1, subject_id: 1 });
  if (largeTx.success) await api(token, 'POST', `/transactions?projectId=${pId}`, { type: 'expense', amount: 99999999999, description: '清理', account_id: 1, subject_id: 1 });

  // ============================================================
  // 4. 不存在的关联 ID
  // ============================================================
  console.log('\n--- 4. 不存在的关联ID ---\n');

  // 不存在的 account_id
  const badAccTx = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'income', amount: 100, description: '不存在账户测试',
    account_id: 99999, subject_id: 1
  });
  R('E-07', '不存在的account_id', !badAccTx.success,
    `success=${badAccTx.success}`,
    badAccTx.success ? { severity: '高', desc: '允许为不存在的账户创建交易，account_id外键校验缺失。余额更新会操作不存在的账户。' } : null);

  // 不存在的 subject_id
  const badSubTx = await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'income', amount: 100, description: '不存在科目测试',
    account_id: 1, subject_id: 99999
  });
  R('E-08', '不存在的subject_id', !badSubTx.success,
    `success=${badSubTx.success}`,
    badSubTx.success ? { severity: '中', desc: '允许使用不存在的subject_id创建交易，外键校验缺失。' } : null);

  // 回退
  if (badAccTx.success) {
    // 这条交易的余额更新到了不存在的账户，不需要回退
  }
  if (badSubTx.success) {
    await api(token, 'POST', `/transactions?projectId=${pId}`, { type: 'expense', amount: 100, description: '清理', account_id: 1, subject_id: 1 });
  }

  // ============================================================
  // 5. 删除有交易的账户
  // ============================================================
  console.log('\n--- 5. 删除有交易的账户 ---\n');

  // 创建账户 → 创建交易 → 删除账户
  const tmpAcc = await api(token, 'POST', `/accounts?projectId=${pId}&limit=500`, {
    name: '关联删除测试', account_type: '活期', currency_type: 'CNY', account_number: 'EDGE-DEL'
  });
  const tmpAccId = tmpAcc.data?.id;
  if (tmpAccId) {
    await api(token, 'POST', `/transactions?projectId=${pId}`, {
      type: 'income', amount: 1000, description: '关联测试', account_id: tmpAccId, subject_id: 1
    });
    const delAcc = await api(token, 'DELETE', `/accounts/${tmpAccId}?projectId=${pId}`);
    R('E-09', '删除有交易的账户', !delAcc.success,
      `success=${delAcc.success}`,
      delAcc.success ? { severity: '高', desc: '允许删除仍有交易记录的账户。CASCADE可能导致交易记录一起被删，造成数据丢失。应先检查是否有关联交易。' } : null);
  }

  // ============================================================
  // 6. 配置管理审计日志
  // ============================================================
  console.log('\n--- 6. 配置管理审计日志 ---\n');

  const logsBefore = await api(token, 'GET', `/activity-logs?projectId=${pId}`);
  const logCountBefore = logsBefore.pagination?.total || (logsBefore.data || []).length;

  // 创建一个币种
  const tmpCur = await api(token, 'POST', `/currency-types?projectId=${pId}`, { name: '日志测试币', code: 'LOG', description: '测试' });
  const tmpCurId = tmpCur.data?.id;

  const logsAfter = await api(token, 'GET', `/activity-logs?projectId=${pId}`);
  const logCountAfter = logsAfter.pagination?.total || (logsAfter.data || []).length;
  const configLogged = logCountAfter > logCountBefore;
  R('E-10', '配置变更自动记日志', configLogged,
    `创建币种前日志=${logCountBefore}, 后=${logCountAfter}`,
    !configLogged ? { severity: '中', desc: '配置管理（币种/科目/部门等）的CRUD操作未自动记录审计日志。仅AccountService和TransactionService有日志，ConfigService缺失。' } : null);
  if (tmpCurId) await api(token, 'DELETE', `/currency-types/${tmpCurId}?projectId=${pId}`);

  // ============================================================
  // 7. CORS 过于宽松
  // ============================================================
  console.log('\n--- 7. 安全配置 ---\n');

  const corsResp = await fetch(`${API}/health`, { method: 'OPTIONS' });
  const acao = corsResp.headers.get('access-control-allow-origin');
  R('E-11', 'CORS不应为通配符*', acao !== '*',
    `Access-Control-Allow-Origin: ${acao}`,
    acao === '*' ? { severity: '中', desc: 'CORS设置为*（允许任何域访问），生产环境应限制为具体域名。' } : null);

  // ============================================================
  // 8. 并发交易（简单模拟）
  // ============================================================
  console.log('\n--- 8. 并发交易 ---\n');

  const balBeforeConc = await getBalance(token, pId, 1);
  // 同时发 5 笔 1000 的收入
  const concPromises = Array.from({ length: 5 }, (_, i) =>
    api(token, 'POST', `/transactions?projectId=${pId}`, {
      type: 'income', amount: 1000, description: `并发测试#${i + 1}`,
      account_id: 1, subject_id: 1
    })
  );
  const concResults = await Promise.all(concPromises);
  const allSuccess = concResults.every(r => r.success);
  const balAfterConc = await getBalance(token, pId, 1);
  const expectedConc = balBeforeConc + 5000;
  const concCorrect = Math.abs(balAfterConc - expectedConc) < 0.01;

  R('E-12', '并发交易余额一致性', concCorrect,
    `前=${balBeforeConc}, 后=${balAfterConc}, 期望=${expectedConc}, 全成功=${allSuccess}`,
    !concCorrect ? { severity: '高', desc: `并发5笔交易后余额不一致。期望${expectedConc}实际${balAfterConc}，可能存在竞态条件。` } : null);

  // 回退并发测试
  await api(token, 'POST', `/transactions?projectId=${pId}`, {
    type: 'expense', amount: 5000, description: '并发测试清理', account_id: 1, subject_id: 1
  });

  // ============================================================
  // 汇总
  // ============================================================
  console.log('\n========================================');
  console.log('边界测试汇总');
  console.log('========================================\n');

  const pass = results.filter(r => r.status === 'PASS').length;
  const bugCount = results.filter(r => r.status === 'BUG').length;
  console.log(`总计: ${results.length} 项, PASS: ${pass}, BUG: ${bugCount}\n`);

  if (bugs.length > 0) {
    console.log('🐛 发现的业务逻辑漏洞:\n');
    bugs.forEach((b, i) => {
      console.log(`  Bug #${i + 1} [${b.severity}] ${b.id} ${b.name}`);
      console.log(`    ${b.desc}\n`);
    });
  }

  fs.mkdirSync('/home/ubuntu/OA-System/test-screenshots/edge', { recursive: true });
  fs.writeFileSync('/home/ubuntu/OA-System/test-screenshots/edge/results.json',
    JSON.stringify({ results, bugs, summary: { total: results.length, pass, bug: bugCount } }, null, 2));
})();
