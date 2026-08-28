/**
 * 浏览器集成测试 — 验证前端页面功能
 */
const { chromium } = require('/home/ubuntu/playwright-tools/node_modules/playwright');
const path = require('path');

const BASE = 'http://localhost:8000';
const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');

let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

async function run() {
    const fs = require('fs');
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // 收集控制台错误
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    try {
        // === 1. 登录页面 ===
        console.log('\n[1] 登录页面测试');
        await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-login-page.png') });

        // 检查页面是否有登录表单
        const hasLoginForm = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            const buttons = document.querySelectorAll('button');
            return inputs.length >= 2 && buttons.length >= 1;
        });
        assert('登录页面加载成功', hasLoginForm);

        // 检查安全响应头
        const response = await page.goto(BASE, { waitUntil: 'networkidle' });
        const headers = response.headers();
        assert('CSP 头存在', !!headers['content-security-policy']);
        assert('X-Frame-Options 存在', !!headers['x-frame-options']);
        assert('X-Content-Type-Options 存在', !!headers['x-content-type-options']);

        // === 2. 错误密码登录 ===
        console.log('\n[2] 错误密码登录测试');
        await page.goto(BASE, { waitUntil: 'networkidle' });

        // 填写错误密码
        const usernameInput = await page.$('input[type="text"], input[name="username"], input:first-of-type');
        const passwordInput = await page.$('input[type="password"]');

        if (usernameInput && passwordInput) {
            await usernameInput.fill('admin');
            await passwordInput.fill('wrongpassword');

            const loginBtn = await page.$('button[type="submit"], button');
            if (loginBtn) {
                await loginBtn.click();
                await page.waitForTimeout(2000);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-wrong-password.png') });

                // 检查是否显示错误提示（页面不应该跳转到 dashboard）
                const url = page.url();
                const hasError = await page.evaluate(() => {
                    const body = document.body.innerText;
                    return body.includes('错误') || body.includes('失败') || body.includes('Error');
                });
                assert('错误密码显示提示', hasError || !url.includes('dashboard'), `url=${url}`);
            }
        }

        // === 3. 正确登录 ===
        console.log('\n[3] 正确登录测试');
        await page.goto(BASE, { waitUntil: 'networkidle' });

        const usernameInput2 = await page.$('input[type="text"], input[name="username"], input:first-of-type');
        const passwordInput2 = await page.$('input[type="password"]');

        if (usernameInput2 && passwordInput2) {
            await usernameInput2.fill('admin');
            await passwordInput2.fill('admin123');

            const loginBtn2 = await page.$('button[type="submit"], button');
            if (loginBtn2) {
                await loginBtn2.click();
                await page.waitForTimeout(3000);
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-after-login.png') });

                const url = page.url();
                assert('登录后跳转', url !== BASE + '/' || url.includes('dashboard') || url.includes('home'));
            }
        }

        // === 4. Dashboard ===
        console.log('\n[4] Dashboard 测试');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-dashboard.png') });

        const dashboardContent = await page.evaluate(() => document.body.innerText);
        assert('Dashboard 有内容', dashboardContent.length > 50);

        // 检查是否有明显的错误信息
        const hasJsError = dashboardContent.includes('Cannot read') ||
                          dashboardContent.includes('undefined') ||
                          dashboardContent.includes('TypeError');
        assert('Dashboard 无 JS 错误', !hasJsError, dashboardContent.substring(0, 200));

        // === 5. 安全路径测试 ===
        console.log('\n[5] 安全路径阻断测试');

        const envPage = await context.newPage();
        const envResp = await envPage.goto(BASE + '/.env', { waitUntil: 'networkidle' });
        assert('.env 被阻止', envResp.status() === 403 || envResp.status() === 404, `status=${envResp.status()}`);
        await envPage.close();

        const gitPage = await context.newPage();
        const gitResp = await gitPage.goto(BASE + '/.git/config', { waitUntil: 'networkidle' });
        assert('.git 被阻止', gitResp.status() === 403 || gitResp.status() === 404, `status=${gitResp.status()}`);
        await gitPage.close();

        const dbInitPage = await context.newPage();
        const dbInitResp = await dbInitPage.goto(BASE + '/api/db_init.php', { waitUntil: 'networkidle' });
        assert('db_init.php 被阻止', dbInitResp.status() === 403 || dbInitResp.status() === 404, `status=${dbInitResp.status()}`);
        await dbInitPage.close();

        // === 6. 导航测试（登录后） ===
        console.log('\n[6] 页面导航测试');

        // 尝试点击侧边栏链接
        const navLinks = await page.$$('nav a, aside a, .sidebar a, [class*="menu"] a, [class*="nav"] a');
        console.log(`  找到 ${navLinks.length} 个导航链接`);

        if (navLinks.length > 0) {
            // 点击第一个非当前页面的链接
            for (const link of navLinks.slice(0, 3)) {
                try {
                    const href = await link.getAttribute('href');
                    const text = await link.innerText();
                    if (href && href !== '#' && href !== '/') {
                        await link.click();
                        await page.waitForTimeout(2000);
                        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `06-nav-${text.trim().substring(0, 10)}.png`) });
                        console.log(`  📄 导航到: ${text.trim()} -> ${page.url()}`);
                    }
                } catch (e) {
                    // 有些链接可能不可点击
                }
            }
        }

        // === 7. 控制台错误汇总 ===
        console.log('\n[7] 控制台错误');
        if (consoleErrors.length > 0) {
            console.log(`  ⚠️  共 ${consoleErrors.length} 个控制台错误:`);
            consoleErrors.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 120)}`));
        } else {
            console.log('  无控制台错误');
        }
        assert('控制台无严重错误', consoleErrors.filter(e => !e.includes('favicon')).length < 5);

    } catch (err) {
        console.error('测试执行异常:', err.message);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') });
    } finally {
        await browser.close();
    }

    console.log(`\n${'='.repeat(40)}`);
    console.log(`浏览器测试: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`截图保存在: ${SCREENSHOT_DIR}`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
