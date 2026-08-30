/**
 * 项目切换测试
 * 关键断言：切换不再触发整页刷新（此前 ProjectSwitcher 用 window.location.href
 * 强制跳转，注释却写着「无刷新切换技术」）。改走 AuthContext.switchProject 后，
 * 由 App 中按项目 id 设 key 的路由子树重新挂载来刷新数据。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const BASE='http://localhost:8000';
let pass=0,fail=0;
const ok=(n,c,d='')=>{c?(pass++,console.log(`  ✅ ${n}`)):(fail++,console.log(`  ❌ ${n} ${d}`));};
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120));});

  await p.goto(`${BASE}/login`);
  await p.fill('input[placeholder*="用户名"]','admin');
  await p.fill('input[placeholder*="密码"]','admin123');
  await p.click('button:has-text("登录")');
  await p.waitForTimeout(2500);

  await p.goto(`${BASE}/accounts`,{waitUntil:'networkidle'});
  await p.waitForTimeout(1500);

  // 标记当前 window 对象，若发生整页刷新该标记会丢失
  await p.evaluate(()=>{ window.__noReloadMarker = 'alive'; });
  const before = await p.evaluate(()=>localStorage.getItem('currentProject'));
  const beforeRows = await p.locator('main').innerText();
  console.log(`\n[1] 切换前项目: ${JSON.parse(before||'{}').name}`);

  // 打开项目切换器
  await p.click('button:has-text("演示项目")');
  await p.waitForTimeout(900);
  const opts = await p.locator('[role="menuitem"], [role="option"]').allTextContents();
  console.log(`  可选项目: ${JSON.stringify(opts)}`);

  const target = p.locator('[role="menuitem"], [role="option"]').filter({ hasNotText: '演示项目' }).first();
  if (await target.count() === 0) { console.log('  ⚠️ 无其他项目可切，跳过'); await b.close(); process.exit(0); }
  const targetName = (await target.textContent()).trim();
  await target.click();
  await p.waitForTimeout(3000);

  console.log(`\n[2] 切换到: ${targetName}`);
  const marker = await p.evaluate(()=>window.__noReloadMarker);
  ok('未发生整页刷新（window 标记存活）', marker === 'alive', `marker=${marker}`);

  const after = await p.evaluate(()=>localStorage.getItem('currentProject'));
  const afterName = JSON.parse(after||'{}').name;
  ok('localStorage 已更新为新项目', afterName && afterName !== JSON.parse(before||'{}').name, `${afterName}`);

  const afterRows = await p.locator('main').innerText();
  ok('页面内容已随项目变化', afterRows !== beforeRows);
  ok('无控制台错误', errs.length===0, errs.join(' | '));

  console.log(`\n${'='.repeat(44)}\n项目切换：${pass+fail} 项 | ✅ ${pass} | ❌ ${fail}\n${'='.repeat(44)}`);
  await b.close(); process.exit(fail?1:0);
})();
