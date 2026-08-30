/**
 * 批量页面错误检测
 * 三重检测：
 *   1. console.error
 *   2. API 网络请求失败（>=400 或返回非 JSON）
 *   3. ★ 页面 DOM 中渲染出的错误文案（上一版遗漏的关键项）
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const fs = require('fs');

const BASE = 'http://localhost:8000';
const SHOT_DIR = './test-screenshots';

const PAGES = [
    { name: '财务仪表盘', path: '/' },
    { name: '账户管理', path: '/accounts' },
    { name: '出入金记录', path: '/transactions/external' },
    { name: '内部划款记录', path: '/transactions/internal' },
    { name: '资产记录', path: '/assets/records' },
    { name: '借贷记录', path: '/assets/loans' },
    { name: '我的申请', path: '/workflows/my-applications' },
    { name: '待审批', path: '/workflows/pending-approvals' },
    { name: '待归帐', path: '/workflows/pending-accounting' },
    { name: '待执行', path: '/workflows/pending-execution' },
    { name: '账户配置', path: '/configurations/account-categories' },
    { name: '资产分类', path: '/configurations/asset-categories' },
    { name: '科目分类', path: '/configurations/subject-categories' },
    { name: '流水类型', path: '/configurations/transaction-types' },
    { name: '审批规则', path: '/configurations/approval-rules' },
    { name: '股东管理', path: '/shareholders' },
    { name: '部门配置', path: '/personnel/departments' },
    { name: '权限管理', path: '/personnel/permissions' },
    { name: '用户管理', path: '/personnel/users' },
    { name: '操作日志', path: '/personnel/activity-logs' },
];

// 页面上出现即判定为故障的文案
const ERROR_PATTERNS = [
    'Unexpected token',
    'is not valid JSON',
    '<!DOCTYPE',
    '获取数据失败',
    '加载失败',
    '获取失败',
    '请求失败',
    '数据库操作失败',
    'Failed to fetch',
    'NetworkError',
    'undefined is not',
    'Cannot read',
    '出错了',
    // 不能用裸 '404'：会误命中时间戳微秒（如 12:08:55.125404）等正常内容
    'HTTP 404', '404 Not Found', '页面不存在',
];

(async () => {
    if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2500);

    // 必须真正离开登录页，且 token 已落地，否则后续扫描的全是登录页（会假绿）
    const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('authToken'));
    if (new URL(page.url()).pathname.startsWith('/login') || !token) {
        console.error(`❌ 登录失败，当前 URL=${page.url()} token=${token ? '有' : '无'}`);
        await page.screenshot({ path: `${SHOT_DIR}/00-login-failed.png` });
        await browser.close();
        process.exit(1);
    }
    console.log('✅ 登录成功\n');

    const broken = [];
    let idx = 0;

    for (const p of PAGES) {
        idx++;
        const consoleErrors = [];
        const apiFailures = [];

        const onConsole = msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
        const onResponse = async resp => {
            const url = resp.url();
            if (!url.includes('/api/')) return;
            if (resp.status() >= 400) {
                apiFailures.push(`HTTP ${resp.status()} ${url.replace(BASE, '')}`);
                return;
            }
            // 200 但返回 HTML —— 正是 "Unexpected token '<'" 的根源
            const ct = resp.headers()['content-type'] || '';
            if (!ct.includes('json')) {
                apiFailures.push(`非JSON响应 (${ct.split(';')[0] || '未知'}) ${url.replace(BASE, '')}`);
            }
        };
        const onRequestFailed = req => {
            if (req.url().includes('/api/')) apiFailures.push(`请求中断 ${req.url().replace(BASE, '')}`);
        };

        page.on('console', onConsole);
        page.on('response', onResponse);
        page.on('requestfailed', onRequestFailed);

        try {
            await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 15000 });
        } catch (e) {
            consoleErrors.push(`导航超时: ${e.message}`);
        }
        await page.waitForTimeout(1200);

        // ★ 读取页面实际渲染的文本
        let bodyText = '';
        try {
            bodyText = await page.evaluate(() => document.body.innerText || '');
        } catch { /* ignore */ }
        const uiErrors = ERROR_PATTERNS
            .filter(kw => bodyText.includes(kw))
            .map(kw => {
                const i = bodyText.indexOf(kw);
                return bodyText.slice(Math.max(0, i - 30), i + 90).replace(/\s+/g, ' ').trim();
            });

        page.off('console', onConsole);
        page.off('response', onResponse);
        page.off('requestfailed', onRequestFailed);

        const issues = [
            ...uiErrors.map(t => ['页面错误文案', t]),
            ...apiFailures.map(t => ['API', t]),
            ...consoleErrors.map(t => ['console', t.length > 160 ? t.slice(0, 160) + '…' : t]),
        ];

        const shot = `${SHOT_DIR}/${String(idx).padStart(2, '0')}-${p.path.replace(/\//g, '_') || '_root'}.png`;
        await page.screenshot({ path: shot, fullPage: false });

        if (issues.length === 0) {
            console.log(`✅ ${p.name} (${p.path})`);
        } else {
            console.log(`❌ ${p.name} (${p.path})`);
            const seen = new Set();
            for (const [type, msg] of issues) {
                const key = type + msg;
                if (seen.has(key)) continue;
                seen.add(key);
                console.log(`   🔴 [${type}] ${msg}`);
            }
            console.log(`   📷 ${shot}`);
            broken.push({ ...p, issues });
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`扫描 ${PAGES.length} 页 | 正常 ${PAGES.length - broken.length} | 故障 ${broken.length}`);
    if (broken.length) {
        console.log(`故障页面: ${broken.map(b => b.name).join('、')}`);
    }
    console.log(`${'='.repeat(60)}`);

    await browser.close();
    process.exit(broken.length > 0 ? 1 : 0);
})();
