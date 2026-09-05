/**
 * 界面上的数据必须来自服务端，写操作必须真的落库。
 *
 * 为什么单列一个套件：这轮查出「新建划款」整条链路都是假的 ——
 * 账户下拉写死 5 个并不存在的名字（运营账户A、外汇账户B…），点提交后
 * 只执行 setAllTransfers 往本地数组塞一条，一个写请求都不发，刷新就消失。
 * 资产记录的页签同样写死 5 个库里没有的分类；新建账户弹窗在接口失败时
 * 用一套 id 固定为 1~5 的假币种与假类型顶上，把「接口挂了」完全盖住。
 *
 * 这些 23 个套件一个都没拦住 —— 它们验的是「接口 200」「页面不白屏」，
 * 而假数据恰恰让页面看起来一切正常。
 *
 * 所以这里只做三件事：
 *   1. 下拉/页签里的选项必须能在数据库里找到对应记录
 *   2. 走完表单提交后，数据库行数必须真的增加
 *   3. 页面上显示的值必须随数据库变化而变化（改库 → 界面跟着变）
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const { execFileSync } = require('child_process');

const BASE = process.env.OA_BASE_URL || 'http://localhost:8000';
const PROJECT = 1;
let pass = 0, fail = 0;
const assert = (name, ok, extra = '') => {
    console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ' ' + extra}`);
    ok ? pass++ : fail++;
};

function q(sql) {
    return execFileSync('docker',
        ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'oa_system', '-tAc', sql],
        { encoding: 'utf8', cwd: '/home/ubuntu/OA-System', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

const TAG = 'NF' + Math.floor(Math.random() * 100000);

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    assert('登录成功', !!(await page.evaluate(() => localStorage.getItem('token'))));

    console.log('\n[1] 下拉与页签里的选项必须真实存在');

    // 划款表单的账户下拉：原先写死「运营账户A」这类库里没有的名字
    await page.goto(`${BASE}/transactions/internal`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const nb = page.locator('button').filter({ hasText: '新建划款' }).first();
    if (await nb.count()) {
        await nb.click();
        await page.waitForTimeout(1800);
        const opts = await page.locator('select').first().locator('option').allInnerTexts().catch(() => []);
        assert('划款账户下拉不为空', opts.length > 0);
        if (opts.length) {
            // 选项形如「TX776360账户A（CNY）」，取括号前的名字去库里找
            const names = opts.slice(0, 5).map(t => t.replace(/\s+/g, '').split('（')[0]);
            const missing = names.filter(n => {
                const esc = n.replace(/'/g, "''");
                return Number(q(`SELECT count(*) FROM accounts WHERE project_id=${PROJECT} AND name='${esc}'`)) === 0;
            });
            assert('划款账户下拉里的账户都真实存在', missing.length === 0,
                   `库里找不到：${missing.join('、')}`);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
    } else {
        console.log('  ⏭️ 未找到「新建划款」入口');
    }

    // 资产页签：原先写死「电脑设备/手机卡」等库里没有的分类
    await page.goto(`${BASE}/assets/records`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const tabs = (await page.locator('[role="tab"]').allInnerTexts())
        .map(t => t.replace(/\s+/g, '')).filter(t => t && t !== '全部');
    if (tabs.length) {
        const missing = tabs.filter(t => {
            const esc = t.replace(/'/g, "''");
            return Number(q(`SELECT count(*) FROM asset_types WHERE project_id=${PROJECT} AND name='${esc}'`)) === 0;
        });
        assert('资产页签都对应真实分类', missing.length === 0, `库里找不到：${missing.join('、')}`);
    }

    // 新建账户弹窗：原先接口失败时用 id 1~5 的假币种/假类型顶上
    await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const ab = page.locator('main button').filter({ hasText: '添加账户' }).first();
    if (await ab.count()) {
        await ab.click();
        await page.waitForTimeout(1500);
        for (const [label, table, col] of [['请选择账户类型', 'account_types', 'name'],
                                           ['请选择币种', 'currency_types', 'code']]) {
            const tr = page.locator('[role="dialog"] button', { hasText: label }).first();
            if (await tr.count() === 0) continue;
            await tr.click();
            await page.waitForTimeout(800);
            const items = (await page.locator('[role="option"]').allInnerTexts()).map(t => t.replace(/\s+/g, ''));
            if (items.length) {
                const missing = items.filter(t => {
                    // 币种显示成「美元 (USD)」，取括号里的 code；类型直接是名字
                    const key = (t.match(/\(([A-Z0-9]+)\)/)?.[1]) || t;
                    const esc = key.replace(/'/g, "''");
                    return Number(q(`SELECT count(*) FROM ${table} WHERE project_id=${PROJECT} AND ${col}='${esc}'`)) === 0;
                });
                assert(`${label}的选项都真实存在`, missing.length === 0, `库里找不到：${missing.join('、')}`);
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
    }

    console.log('\n[2] 提交后必须真的落库');
    // 部门是字段最少、最容易走通的写入口，用它守「提交是否真的调 API」
    const before = Number(q(`SELECT count(*) FROM departments WHERE project_id=${PROJECT}`));
    await page.goto(`${BASE}/personnel/departments`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const db = page.locator('main button').filter({ hasText: /添加|新增/ }).first();
    if (await db.count() && await db.isEnabled()) {
        await db.click();
        await page.waitForTimeout(1400);
        await page.locator('[role="dialog"] input').first().fill(`${TAG}部门`);
        const sb = page.locator('[role="dialog"] button').filter({ hasNotText: /取消|Close|关闭/ }).last();
        await sb.click().catch(() => {});
        await page.waitForTimeout(2500);
        const after = Number(q(`SELECT count(*) FROM departments WHERE project_id=${PROJECT}`));
        assert('新建部门真的落库了', after === before + 1, `${before} → ${after}（没落库说明只改了本地 state）`);
        q(`DELETE FROM activity_logs WHERE description LIKE '%${TAG}%'`);
        q(`DELETE FROM departments WHERE name LIKE '${TAG}%'`);
    } else {
        console.log('  ⏭️ 部门添加入口不可用');
    }

    console.log('\n[3] 界面数据必须随数据库变化');
    const deptId = q(`SELECT id FROM departments WHERE project_id=${PROJECT} ORDER BY id LIMIT 1`);
    if (deptId) {
        const orig = q(`SELECT name FROM departments WHERE id=${deptId}`);
        const probe = `${TAG}探针`;
        q(`UPDATE departments SET name='${probe}' WHERE id=${deptId}`);
        await page.goto(`${BASE}/personnel/departments`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        const shown = (await page.evaluate(() => document.body.innerText)).includes(probe);
        // 还原必须在断言之后、且无论断言成败都要执行
        q(`UPDATE departments SET name='${orig.replace(/'/g, "''")}' WHERE id=${deptId}`);
        assert('改库后界面显示新值', shown, '界面没跟着变，说明这块是写死的');
    }

    await browser.close();
    console.log(`\n真实数据：总计 ${pass + fail} | ✅ ${pass} | ❌ ${fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();
