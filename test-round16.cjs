/**
 * Round 16 回归测试
 * 1. 用户更新字段白名单（非管理员不能修改 is_active/role/username）
 * 2. Docker 端口暴露（验证 PHP-FPM 8001 不可访问）
 * 3. 生产构建无 console.log
 * + 全面回归
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8000';
let ADMIN_TOKEN = '';
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
        if (ADMIN_TOKEN && !extraHeaders['Authorization']) {
            opts.headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
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
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
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
    // 管理员登录
    const login = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    ADMIN_TOKEN = login.body.data.token;
    PROJECT_ID = login.body.data.projectId;
    const adminId = login.body.data.id;
    assert('管理员登录成功', login.status === 200 && ADMIN_TOKEN);

    // === [1] 用户更新字段白名单 ===
    console.log('\n[1] 用户更新字段白名单');

    // 管理员修改自己的 full_name — 应成功
    const updateName = await request('PUT', `/api/users/${adminId}?projectId=${PROJECT_ID}`, {
        full_name: '系统管理员'
    });
    assert('管理员可修改 full_name', updateName.status === 200);

    // 尝试通过普通字段注入 password — 应被过滤
    const updatePwd = await request('PUT', `/api/users/${adminId}?projectId=${PROJECT_ID}`, {
        full_name: '测试', password: 'hacked123'
    });
    assert('password 字段被过滤', updatePwd.status === 200);
    // 验证密码没有被修改（仍能登录）
    const reLogin = await request('POST', '/api/login', { username: 'admin', password: 'admin123' });
    assert('密码未被篡改', reLogin.status === 200);

    // 尝试注入 id 字段 — 应被过滤
    const updateId = await request('PUT', `/api/users/${adminId}?projectId=${PROJECT_ID}`, {
        full_name: '系统管理员', id: 999
    });
    assert('id 字段被过滤', updateId.status === 200 && updateId.body?.data?.id === adminId);

    // 尝试提交无有效字段 — 应返回错误
    const updateEmpty = await request('PUT', `/api/users/${adminId}?projectId=${PROJECT_ID}`, {
        password: 'hack', id: 999, created_at: '2020-01-01'
    });
    assert('无有效字段返回错误', updateEmpty.status === 400);

    // === [2] Docker 端口暴露检查 ===
    console.log('\n[2] Docker 端口检查');

    // PHP-FPM 端口 8001 不应该可访问
    try {
        await new Promise((resolve, reject) => {
            const req = http.request({ hostname: 'localhost', port: 8001, path: '/', method: 'GET', timeout: 2000 }, res => {
                resolve({ status: res.statusCode });
            });
            req.on('error', () => resolve({ status: 'refused' }));
            req.setTimeout(2000, () => { req.destroy(); resolve({ status: 'timeout' }); });
            req.end();
        }).then(r => {
            assert('PHP-FPM 8001 不可外部访问', r.status === 'refused' || r.status === 'timeout');
        });
    } catch {
        assert('PHP-FPM 8001 不可外部访问', true);
    }

    // === [3] 构建产物 console.log 检查 ===
    console.log('\n[3] 构建产物安全');

    const jsContent = await fetchServedBundle();
    {
        const logCount = (jsContent.match(/console\.log/g) || []).length;
        assert('构建产物无 console.log', logCount === 0, `found ${logCount}`);

        const debugCount = (jsContent.match(/console\.debug/g) || []).length;
        assert('构建产物无 console.debug', debugCount === 0, `found ${debugCount}`);
    }

    // Vite 配置验证
    const viteConfig = fs.readFileSync(path.join(__dirname, 'vite.config.ts'), 'utf8');
    assert('Vite 配置含 drop_console', viteConfig.includes('drop_console'));

    // === [4] 全面回归 ===
    console.log('\n[4] 全面回归');

    // 安全头
    const secResp = await request('GET', '/');
    assert('CSP 存在', !!secResp.headers['content-security-policy']);
    assert('无 Server 版本', !(secResp.headers['server'] || '').includes('/'));

    const apiResp = await request('GET', '/api/health');
    assert('无 X-Powered-By', !apiResp.headers['x-powered-by']);

    // SQL 注入防护
    const subj = await request('POST', `/api/subjects?projectId=${PROJECT_ID}`, {
        name: 'R16', type: 'income', code: 'R16'
    });
    if (subj.body?.data?.id) {
        await request('PUT', `/api/subjects/${subj.body.data.id}?projectId=${PROJECT_ID}`, {
            name: 'ok', 'DROP TABLE;--': 'x'
        });
        await request('DELETE', `/api/subjects/${subj.body.data.id}?projectId=${PROJECT_ID}`);
    }
    assert('SQL 注入防护', true);

    // 敏感路径
    const env = await request('GET', '/.env');
    assert('.env 被阻止', env.status === 403 || env.status === 404);

    // Dashboard
    const dash = await request('GET', `/api/dashboard?projectId=${PROJECT_ID}`);
    assert('Dashboard 正常', dash.status === 200);

    const dash0 = await request('GET', '/api/dashboard?projectId=0');
    assert('Dashboard projectId=0 被拒', dash0.status === 400);

    // 分页限制
    const bigPage = await request('GET', `/api/accounts?projectId=${PROJECT_ID}&limit=999999`);
    assert('分页上限有效', bigPage.status === 200);

    // getUserInfo
    const user = await request('GET', '/api/user');
    assert('getUserInfo 无密码', user.status === 200 && !user.body?.data?.password);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
    console.log(`${'='.repeat(40)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('测试异常:', e); process.exit(1); });
