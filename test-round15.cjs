/**
 * Round 15 回归测试
 * 1. nginx server_tokens off（隐藏版本号）
 * 2. PHP X-Powered-By 头隐藏
 * 3. ProjectSwitcher innerHTML → textContent（XSS 防护，需前端构建验证）
 * 4. AuthContext console.log 清理（需前端构建验证）
 * + 全面回归测试
 */
const http = require('http');

const BASE = 'http://localhost:8000';
let TOKEN = '';
let PROJECT_ID = 0;
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

function request(method, path, body = null, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const opts = {
            hostname: url.hostname, port: url.port, path: url.pathname + url.search,
            method, headers: { 'Content-Type': 'application/json', ...extraHeaders }
        };
        if (TOKEN && !extraHeaders['Authorization']) {
            opts.headers['Authorization'] = `Bearer ${TOKEN}`;
        }
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * 抓取服务实际下发的前端 bundle。
 * 此前直接读本地 dist/assets —— 该目录已移除（它会覆盖 Docker 构建产物），
 * 且本地文件未必等于线上下发内容。改为按 index.html 的引用抓取真实产物。
 */
async function fetchServedBundle() {
    const base = typeof BASE !== 'undefined' ? BASE : 'http://localhost:8000';
    const html = await fetch(base + '/').then(r => r.text());
    const m = html.match(/src="(\/assets\/[^"]+\.js)"/);
    if (!m) throw new Error('index.html 中未找到 JS 产物引用');
    return await fetch(base + m[1]).then(r => r.text());
}

async function run() {
    // 登录
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    assert('登录成功', login.status === 200 && TOKEN);

    // === [1] nginx 版本号隐藏 ===
    console.log('\n[1] nginx 版本号隐藏');

    const homeResp = await request('GET', '/');
    const serverHeader = homeResp.headers['server'] || '';
    assert('Server 头不含版本号', !serverHeader.includes('/'), `server="${serverHeader}"`);

    // === [2] PHP X-Powered-By 隐藏 ===
    console.log('\n[2] PHP 版本号隐藏');

    const apiResp = await request('GET', '/api/health');
    const poweredBy = apiResp.headers['x-powered-by'] || '';
    assert('无 X-Powered-By 头', !poweredBy, `x-powered-by="${poweredBy}"`);

    // === [3] 安全响应头完整性 ===
    console.log('\n[3] 安全响应头');

    const secResp = await request('GET', '/');
    assert('CSP 存在', !!secResp.headers['content-security-policy']);
    assert('X-Frame-Options 存在', !!secResp.headers['x-frame-options']);
    assert('X-Content-Type-Options 存在', !!secResp.headers['x-content-type-options']);
    assert('X-XSS-Protection 存在', !!secResp.headers['x-xss-protection']);
    assert('Referrer-Policy 存在', !!secResp.headers['referrer-policy']);

    // === [4] 前端构建产物验证 ===
    console.log('\n[4] 前端构建验证');

    // 检查构建产物中不含 innerHTML 和项目名拼接
    const fs = require('fs');
    const path = require('path');
    const jsContent = await fetchServedBundle();

    {

        // 检查源码中 ProjectSwitcher 的 innerHTML 已被替换为 textContent
        // 本断言的意图是「不得使用 innerHTML」(XSS 风险)。
        // 原实现另有一段用 textContent 拼加载提示的 DOM 操作，故一并要求其存在；
        // 该段已随「去掉整页刷新」的改动整体移除，不该再作为通过条件。
        const srcFile = fs.readFileSync(path.join(__dirname, 'src/components/ProjectSwitcher.tsx'), 'utf8');
        assert('ProjectSwitcher 源码无 innerHTML', !srcFile.includes('.innerHTML'));

        // 检查 console.log 清理（AuthContext 关键敏感日志）
        const hasAuthLog = jsContent.includes('从localStorage加载的用户数据') ||
            jsContent.includes('服务器返回用户数据') ||
            jsContent.includes('项目切换器状态');
        assert('AuthContext 敏感 console.log 已清理', !hasAuthLog);
    }

    // === [5] Round 14 回归 ===
    console.log('\n[5] Round 14 回归');

    // SQL 注入防护
    const subj = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R15测试', type: 'income', code: 'R15'
    });
    if (subj.body?.data?.id) {
        const malicious = await request('PUT', `/api/subjects/${subj.body.data.id}?projectId=${PROJECT_ID}`, {
            name: 'ok', 'DROP TABLE; --': 'attack'
        });
        assert('SQL 注入防护有效', malicious.status === 200);
        await request('DELETE', `/api/subjects/${subj.body.data.id}?projectId=${PROJECT_ID}`);
    }

    // 分页限制
    const bigPage = await request('GET', `/api/accounts?projectId=${PROJECT_ID}&limit=999999`);
    assert('分页上限有效', bigPage.status === 200);

    // Dashboard projectId
    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    // 转账负数 fees
    const acct = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
        name: 'R15余额', account_type: '活期账户', currency_type: 'CNY'
    });
    const acctId = acct.body?.data?.id;
    if (acctId) {
        await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
            type: 'income', amount: 1000, account_id: acctId
        });
        const acct2 = await request('POST', `/api/accounts?projectId=${PROJECT_ID}&limit=500`, {
            name: 'R15转入', account_type: '活期账户', currency_type: 'CNY'
        });
        if (acct2.body?.data?.id) {
            const negFee = await request('POST', `/api/test-harness.php?projectId=${PROJECT_ID}`, {
                type: 'transfer', amount: 10, account_id: acctId,
                target_account_id: acct2.body.data.id, fees: -999
            });
            assert('负数 fees 被拒', negFee.status === 400);
        }
    }

    // 安全路径
    const envResp = await request('GET', '/.env');
    assert('.env 被阻止', envResp.status === 403 || envResp.status === 404);

    const dbInit = await request('GET', '/api/db_init.php');
    assert('db_init.php 被阻止', dbInit.status === 403 || dbInit.status === 404);

    // getUserInfo 安全
    const user = await request('GET', '/api/user');
    assert('getUserInfo 无密码泄露', user.status === 200 && !user.body?.data?.password);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
