/**
 * 批量页面错误检测 — 登录后逐页访问，收集所有 console.error 和网络错误
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');

const BASE = 'http://localhost:8000';
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
    { name: '股东管理', path: '/shareholders' },
    { name: '部门配置', path: '/personnel/departments' },
    { name: '权限管理', path: '/personnel/permissions' },
    { name: '用户管理', path: '/personnel/users' },
    { name: '操作日志', path: '/personnel/activity-logs' },
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 登录
    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder*="用户名"]', 'admin');
    await page.fill('input[placeholder*="密码"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForURL('**/');
    console.log('✅ 登录成功\n');

    let totalErrors = 0;

    for (const p of PAGES) {
        const errors = [];
        const failedRequests = [];

        // 收集 console.error
        const onError = msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        };
        page.on('console', onError);

        // 收集失败的网络请求 (非200的API请求)
        const onResponse = resp => {
            const url = resp.url();
            if (url.includes('/api/') && resp.status() >= 400) {
                failedRequests.push(`${resp.status()} ${url.replace(BASE, '')}`);
            }
        };
        page.on('response', onResponse);

        // 收集 JSON parse 错误的请求 (返回HTML的)
        const onRequestFailed = req => {
            if (req.url().includes('/api/')) {
                failedRequests.push(`FAILED ${req.url().replace(BASE, '')}`);
            }
        };
        page.on('requestfailed', onRequestFailed);

        try {
            await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 10000 });
        } catch (e) {
            errors.push(`Navigation timeout: ${e.message}`);
        }

        // 额外等待一下让异步请求完成
        await page.waitForTimeout(1500);

        page.off('console', onError);
        page.off('response', onResponse);
        page.off('requestfailed', onRequestFailed);

        const hasIssue = errors.length > 0 || failedRequests.length > 0;
        const icon = hasIssue ? '❌' : '✅';
        console.log(`${icon} ${p.name} (${p.path})`);

        if (failedRequests.length > 0) {
            for (const fr of failedRequests) {
                console.log(`   🔴 API失败: ${fr}`);
            }
        }
        if (errors.length > 0) {
            for (const e of errors) {
                // 截断长错误
                const short = e.length > 150 ? e.substring(0, 150) + '...' : e;
                console.log(`   🔴 console.error: ${short}`);
            }
        }

        totalErrors += errors.length + failedRequests.length;
    }

    console.log(`\n${'='.repeat(55)}`);
    console.log(`页面扫描完成: ${PAGES.length} 页 | 总问题数: ${totalErrors}`);
    console.log(`${'='.repeat(55)}`);

    await browser.close();
    process.exit(totalErrors > 0 ? 1 : 0);
})();
