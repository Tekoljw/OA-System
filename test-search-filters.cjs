/**
 * 每个搜索框在界面上输入一个必然不存在的词，结果必须归零。
 *
 * 为什么单列一个套件：借贷记录的搜索框没有绑定 value/onChange，输入框是个
 * 纯装饰，敲什么都不会发请求；操作日志的 search/action/dateFilter 三个参数
 * 前端都发了、服务端一个都不读，输入什么都返回全部 12872 条。
 * 两处都是「界面看着能用、实际从来没工作过」，而 19 个回归套件全绿 ——
 * 因为没有一个套件验证过「搜索之后结果真的变少了」。
 *
 * 刻意走浏览器而不是直接打接口：这两类缺陷一个在前端（框没接线）、一个在
 * 服务端（参数不读），只测接口会漏掉前者。而且有些页面（申请单、资产记录）
 * 的搜索是前端本地过滤，服务端根本没有 search 参数，只测接口会误判成缺陷。
 *
 * 判据用「不存在的词 → 0 条」而不是「关键词 → 有结果」：后者在搜索完全
 * 失效（原样返回全部）时也会通过，等于没测。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');

const BASE = process.env.OA_BASE_URL || 'http://localhost:8000';
const NONSENSE = 'ZZQXNOTEXIST9988';
let pass = 0, fail = 0;
const assert = (name, ok, extra = '') => {
    console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ' ' + extra}`);
    ok ? pass++ : fail++;
};

const PAGES = [
    ['资产记录',   '/assets/records'],
    ['内部划款',   '/transactions/internal'],
    ['操作日志',   '/personnel/activity-logs'],
    ['出入金记录', '/transactions/external'],
    ['待执行',     '/workflows/pending-execution'],
    ['借贷记录',   '/assets/loans'],
    ['我的申请',   '/workflows/my-applications'],
    ['待归账',     '/workflows/pending-accounting'],
    ['待审批',     '/workflows/pending-approvals'],
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    assert('登录成功', !!(await page.evaluate(() => localStorage.getItem('token'))));

    /** 空状态（「暂无…」）本身也是一个 tr，不能算作数据行 */
    const dataRows = async () => {
        const n = await page.locator('tbody tr').count();
        if (n === 1) {
            const t = await page.locator('tbody tr').first().innerText().catch(() => '');
            if (/暂无|没有|无数据|无记录/.test(t)) return 0;
        }
        return n;
    };

    console.log('\n[1] 界面搜索：不存在的词必须归零');
    let checked = 0;
    for (const [name, path] of PAGES) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(1600);

        const box = page.locator('input[placeholder*="搜索"]').first();
        if (await box.count() === 0) { console.log(`  ⏭️ ${name} 没有搜索框`); continue; }

        const before = await dataRows();
        if (before === 0) { console.log(`  ⏭️ ${name} 本来就没有数据，无从判断`); continue; }

        await box.fill(NONSENSE);
        await page.waitForTimeout(2000);   // 留出防抖与请求往返的时间
        const after = await dataRows();
        assert(`${name} 搜不存在的词后结果归零`, after === 0,
               `搜索前 ${before} 行 → 搜索后仍有 ${after} 行`);
        checked++;

        // 清空后必须能恢复，否则搜索框会把用户困在空列表里
        await box.fill('');
        await page.waitForTimeout(1800);
        assert(`${name} 清空搜索后恢复列表`, (await dataRows()) > 0);
    }
    assert('至少验证到 3 个有数据的搜索框', checked >= 3, `实际只验到 ${checked} 个`);

    console.log('\n[2] 操作日志的操作类型与日期筛选');
    await page.goto(`${BASE}/personnel/activity-logs`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    if (await dataRows() > 0) {
        // 服务端此前对 action / dateFilter 一概不读，这两条守住它
        const T = await page.evaluate(() => localStorage.getItem('token'));
        const get = async (qs) => {
            const r = await fetch(`${BASE}/api/activity-logs?projectId=1&limit=50&${qs}`,
                { headers: { Authorization: `Bearer ${T}` } });
            const j = await r.json();
            return { ok: r.ok, body: j };
        };
        const byAction = await page.evaluate(async ([base, t]) => {
            const r = await fetch(`${base}/api/activity-logs?projectId=1&limit=50&action=ZZNOEXIST`,
                { headers: { Authorization: `Bearer ${t}` } });
            return (await r.json()).data?.length ?? -1;
        }, [BASE, T]);
        assert('按不存在的操作类型筛选返回 0 条', byAction === 0, `返回 ${byAction} 条`);

        const byDate = await page.evaluate(async ([base, t]) => {
            const r = await fetch(`${base}/api/activity-logs?projectId=1&limit=50&dateFilter=1999-01-01`,
                { headers: { Authorization: `Bearer ${t}` } });
            return (await r.json()).data?.length ?? -1;
        }, [BASE, T]);
        assert('按很久以前的日期筛选返回 0 条', byDate === 0, `返回 ${byDate} 条`);

        // 非法日期要给人话，不能是「数据库操作失败」这类没有信息量的 500
        const badDate = await page.evaluate(async ([base, t]) => {
            const r = await fetch(`${base}/api/activity-logs?projectId=1&dateFilter=notadate`,
                { headers: { Authorization: `Bearer ${t}` } });
            return await r.json();
        }, [BASE, T]);
        assert('非法日期返回可读提示而非 500',
               badDate.success === false && /日期/.test(badDate.error?.message || ''),
               JSON.stringify(badDate.error || {}).slice(0, 80));

        // 参数化查询下，注入串只是个匹配不到的普通关键词
        const inject = await page.evaluate(async ([base, t]) => {
            const r = await fetch(`${base}/api/activity-logs?projectId=1&limit=5&search=${encodeURIComponent("' OR 1=1--")}`,
                { headers: { Authorization: `Bearer ${t}` } });
            return (await r.json()).data?.length ?? -1;
        }, [BASE, T]);
        assert('注入串被当作普通关键词', inject === 0, `返回 ${inject} 条`);
    }

    await browser.close();
    console.log(`\n搜索筛选：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
