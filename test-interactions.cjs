/**
 * 深度交互扫描 — 页面加载之外，逐一点击 Tab 和会打开弹窗的按钮，
 * 捕获只有交互才会触发的数据请求failures。
 *
 * 页面级扫描（test-all-pages.cjs）只覆盖首屏请求，
 * 大量数据是点 Tab / 开弹窗 / 展开下拉才拉取的，必须单独覆盖。
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const fs = require('fs');

const BASE = 'http://localhost:8000';
const SHOT_DIR = './test-screenshots/interactions';

const PAGES = [
    { name: '财务仪表盘', path: '/' },
    { name: '账户管理', path: '/accounts' },
    { name: '出入金记录', path: '/transactions/external' },
    { name: '内部划款记录', path: '/transactions/internal' },
    { name: '资产记录', path: '/assets/records' },
    { name: '借贷记录', path: '/assets/loans' },
    { name: '账户配置', path: '/configurations/account-categories' },
    { name: '资产分类', path: '/configurations/asset-categories' },
    { name: '科目分类', path: '/configurations/subject-categories' },
    { name: '流水类型', path: '/configurations/transaction-types' },
    { name: '股东管理', path: '/shareholders' },
    { name: '部门配置', path: '/personnel/departments' },
    { name: '权限管理', path: '/personnel/permissions' },
    { name: '用户管理', path: '/personnel/users' },
    { name: '操作日志', path: '/personnel/activity-logs' },
];

const ERROR_TEXT = [
    'Unexpected token', 'is not valid JSON', '<!DOCTYPE',
    '获取数据失败', '加载失败', '获取失败', '请求失败', '数据库操作失败',
    'Failed to fetch', 'Cannot read', 'undefined is not',
];

(async () => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

    // ---- 全局收集器 ----
    let bucket = null; // { api:[], console:[] }
    page.on('response', resp => {
        if (!bucket) return;
        const u = resp.url();
        if (!u.includes('/api/')) return;
        if (resp.status() >= 400) bucket.api.push(`HTTP ${resp.status()} ${u.replace(BASE, '')}`);
        else if (!(resp.headers()['content-type'] || '').includes('json'))
            bucket.api.push(`非JSON ${u.replace(BASE, '')}`);
    });
    page.on('console', m => { if (bucket && m.type() === 'error') bucket.console.push(m.text().slice(0, 140)); });
    page.on('pageerror', e => { if (bucket) bucket.console.push(`未捕获异常: ${String(e).slice(0, 140)}`); });

    // ---- 登录 ----
    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);
    if (!await page.evaluate(() => localStorage.getItem('token'))) {
        console.error('❌ 登录失败'); await browser.close(); process.exit(1);
    }
    console.log('✅ 登录成功\n');

    const problems = [];

    const snapshot = async (label, shotName) => {
        await page.waitForTimeout(900);
        const text = await page.evaluate(() => document.body.innerText || '').catch(() => '');
        const uiErr = ERROR_TEXT.filter(k => text.includes(k))
            .map(k => { const i = text.indexOf(k); return text.slice(Math.max(0, i - 25), i + 80).replace(/\s+/g, ' ').trim(); });
        const found = [...uiErr.map(t => ['页面报错', t]),
                       ...bucket.api.map(t => ['API', t]),
                       ...bucket.console.map(t => ['console', t])];
        if (found.length) {
            const shot = `${SHOT_DIR}/${shotName}.png`;
            await page.screenshot({ path: shot }).catch(() => {});
            const seen = new Set();
            console.log(`   ❌ ${label}`);
            for (const [t, m] of found) {
                const k = t + m; if (seen.has(k)) continue; seen.add(k);
                console.log(`      🔴 [${t}] ${m}`);
            }
            problems.push({ label, found });
        }
        bucket.api = []; bucket.console = [];
    };

    const closeOverlay = async () => {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
    };

    for (const p of PAGES) {
        console.log(`\n▶ ${p.name} (${p.path})`);
        bucket = { api: [], console: [] };
        await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        const slug = p.path.replace(/\//g, '_') || '_root';
        await snapshot('首屏加载', `${slug}-load`);

        // ---- 点击所有 Tab ----
        const tabs = await page.locator('[role="tab"]').all();
        for (let i = 0; i < tabs.length; i++) {
            const t = tabs[i];
            const name = (await t.textContent().catch(() => ''))?.trim().slice(0, 20) || `tab${i}`;
            if (!await t.isVisible().catch(() => false)) continue;
            await t.click({ timeout: 4000 }).catch(() => {});
            await snapshot(`Tab「${name}」`, `${slug}-tab${i}`);
        }

        // ---- 点击可能打开弹窗的按钮 ----
        const btnTexts = await page.locator('main button, [role="main"] button').evaluateAll(
            els => els.map(e => (e.innerText || '').trim()).filter(Boolean)
        ).catch(() => []);
        const targets = [...new Set(btnTexts)].filter(t =>
            /新增|添加|创建|新建|编辑|配置|管理|设置|导入|导出|Add|New|筛选|详情/.test(t) && t.length < 15
        ).slice(0, 6);

        for (const label of targets) {
            const btn = page.locator('main button', { hasText: label }).first();
            if (!await btn.isVisible().catch(() => false)) continue;
            await btn.click({ timeout: 4000 }).catch(() => {});
            await snapshot(`按钮「${label}」`, `${slug}-btn-${label.replace(/[^\w\u4e00-\u9fa5]/g, '')}`);
            await closeOverlay();
        }
    }

    console.log(`\n${'='.repeat(62)}`);
    console.log(problems.length ? `发现 ${problems.length} 处交互故障` : '未发现交互故障');
    console.log(`${'='.repeat(62)}`);
    await browser.close();
    process.exit(problems.length ? 1 : 0);
})();
