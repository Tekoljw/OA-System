/**
 * 审批规则配置页 UI 测试
 * 覆盖新增（含多级节点与会签人数）、编辑回填、表单校验、二次确认删除的完整闭环。
 * 自清理：上一轮若中途失败会残留规则，导致按名称匹配到多行而误判。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const BASE='http://localhost:8000';
let pass=0, fail=0;
const ok=(n,c,d='')=>{ c?(pass++,console.log(`  ✅ ${n}`)):(fail++,console.log(`  ❌ ${n} ${d}`)); };
/** 清理上一轮残留，保证可重复运行 */
async function resetFixtures() {
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then(r => r.json()).catch(() => null);
  const token = login?.data?.token;
  if (!token) return;
  const auth = { Authorization: `Bearer ${token}` };
  const list = await fetch(`${BASE}/api/approval-rules?projectId=1`, { headers: auth })
    .then(r => r.json()).catch(() => null);
  for (const r of list?.data || []) {
    if (r.name.includes('UI测试规则')) {
      await fetch(`${BASE}/api/approval-rules/${r.id}?projectId=1`, { method: 'DELETE', headers: auth });
      console.log(`  🧹 清理残留规则 #${r.id} ${r.name}`);
    }
  }
}

(async()=>{
  await resetFixtures();
  const b=await chromium.launch({headless:true});
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs=[];
  p.on('console',m=>{ if(m.type()==='error') errs.push(m.text().slice(0,120)); });
  p.on('pageerror',e=>errs.push('未捕获: '+String(e).slice(0,120)));

  await p.goto(`${BASE}/login`);
  await p.fill('input[placeholder*="用户名"]','admin');
  await p.fill('input[placeholder*="密码"]','admin123');
  await p.click('button:has-text("登录")');
  await p.waitForTimeout(2500);

  await p.goto(`${BASE}/configurations/approval-rules`,{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  const before = await p.locator('tbody tr').count();
  console.log(`\n[1] 初始规则数: ${before}`);
  ok('列表已渲染', before >= 3);

  // ---- 新增 ----
  console.log('\n[2] 新增规则');
  await p.click('button:has-text("新增规则")');
  await p.waitForTimeout(700);
  ok('弹窗打开', await p.locator('text=新增审批规则').isVisible());

  await p.fill('input[placeholder*="小额"]','UI测试规则');
  const nums = p.locator('[role="dialog"] input[type="number"]');
  await nums.nth(0).fill('50000');   // 下限
  await nums.nth(1).fill('80000');   // 上限
  // 加一级：管理员 3 人会签
  await p.click('button:has-text("加一级")');
  await p.waitForTimeout(500);
  const nums2 = p.locator('[role="dialog"] input[type="number"]');
  await nums2.last().fill('3');      // 会签人数
  await p.click('[role="dialog"] button:has-text("保存")');
  await p.waitForTimeout(2000);

  const afterAdd = await p.locator('tbody tr').count();
  ok('新增后行数 +1', afterAdd === before+1, `${before} -> ${afterAdd}`);
  const row = p.locator('tbody tr', { hasText: 'UI测试规则' });
  ok('新规则出现在列表', await row.count() === 1);
  const rowTxt = await row.first().innerText().catch(()=> '');
  ok('审批链显示会签人数 ×3', /管理员\s*×3/.test(rowTxt.replace(/\s+/g,' ')), rowTxt.replace(/\n/g,' | '));
  ok('金额区间正确', /50,?000/.test(rowTxt) && /80,?000/.test(rowTxt), rowTxt.replace(/\n/g,' | '));

  // ---- 编辑 ----
  console.log('\n[3] 编辑规则');
  await row.first().locator('button[aria-label="编辑"]').click();
  await p.waitForTimeout(800);
  ok('编辑弹窗回填名称',
     await p.locator('[role="dialog"] input').first().inputValue() === 'UI测试规则');
  await p.locator('[role="dialog"] input').first().fill('UI测试规则-已改');
  await p.click('[role="dialog"] button:has-text("保存")');
  await p.waitForTimeout(2000);
  ok('列表显示新名称', await p.locator('tbody tr', { hasText: 'UI测试规则-已改' }).count() === 1);

  // ---- 校验：上限必须大于下限 ----
  console.log('\n[4] 表单校验');
  await p.locator('tbody tr', { hasText: 'UI测试规则-已改' }).locator('button[aria-label="编辑"]').click();
  await p.waitForTimeout(800);
  const n3 = p.locator('[role="dialog"] input[type="number"]');
  await n3.nth(0).fill('90000');  // 下限 > 上限
  await p.click('[role="dialog"] button:has-text("保存")');
  await p.waitForTimeout(1200);
  ok('上限小于下限被拦截（弹窗未关闭）', await p.locator('[role="dialog"]').isVisible());
  await p.click('[role="dialog"] button:has-text("取消")');
  await p.waitForTimeout(1000);
  ok('点取消可关闭弹窗', await p.locator('[role="dialog"]').count() === 0);

  // ---- 删除 ----
  console.log('\n[5] 删除规则');
  await p.locator('tbody tr', { hasText: 'UI测试规则-已改' }).locator('button[aria-label="删除"]').click();
  await p.waitForTimeout(700);
  ok('二次确认弹窗出现', await p.locator('text=确认删除该审批规则').isVisible());
  await p.click('button:has-text("删除")');
  await p.waitForTimeout(2000);
  const afterDel = await p.locator('tbody tr').count();
  ok('删除后行数还原', afterDel === before, `${afterDel} vs ${before}`);
  ok('测试规则已消失', await p.locator('tbody tr', { hasText: 'UI测试规则' }).count() === 0);

  console.log(`\n控制台错误: ${errs.length ? errs.join(' | ') : '无'}`);
  ok('全程无控制台错误', errs.length === 0);
  console.log(`\n${'='.repeat(46)}\n审批规则配置页 UI：${pass+fail} 项 | ✅ ${pass} | ❌ ${fail}\n${'='.repeat(46)}`);
  await b.close();
  process.exit(fail?1:0);
})();
