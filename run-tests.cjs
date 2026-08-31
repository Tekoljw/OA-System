#!/usr/bin/env node
/**
 * 测试总入口。
 *
 * 此前 34 个测试脚本散落在仓库里、只能手工一个个跑，实际长期只有 11 个被执行，
 * 其余悄悄腐化：7 个直接打生产域名、路由路径过时、账户 id 硬编码、
 * 断言基于分页截断的数据。加这个入口是为了让「全跑一遍」成为一条命令。
 *
 *   node run-tests.cjs            全部
 *   node run-tests.cjs core       仅核心套件
 *   node run-tests.cjs -- <名字>  只跑匹配的
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 核心套件：本次会话新建或重写、断言明确、可重复运行
const CORE = [
    'test-transactions', 'test-workflow-ui', 'test-my-applications', 'test-edit-delete', 'test-form-submit', 'test-delete-semantics',
    'test-assets-loans', 'test-approval-workflow', 'test-approval-rules-ui',
    'test-project-switch', 'test-multi-role', 'test-project-isolation',
    'test-all-pages', 'test-interactions',
];

// 遗留套件：早期编写，本次已修复到可运行
const LEGACY = [
    'test-m1-auth', 'test-m2-accounts', 'test-m3-transactions', 'test-m4-transfer',
    'test-m5-to-m10', 'test-shareholder', 'test-business-logic', 'test-edge-cases',
    ...Array.from({ length: 15 }, (_, i) => `test-round${i + 6}`),
];

const arg = process.argv[2];
const filter = process.argv.includes('--') ? process.argv[process.argv.indexOf('--') + 1] : null;

let suite = [...CORE, ...LEGACY];
if (arg === 'core') suite = CORE;
else if (arg === 'legacy') suite = LEGACY;
if (filter) suite = suite.filter(n => n.includes(filter));

suite = suite.filter(n => fs.existsSync(path.join(__dirname, `${n}.cjs`)));

const results = [];
const started = Date.now();

for (const name of suite) {
    process.stdout.write(`▶ ${name.padEnd(28)}`);
    const t0 = Date.now();
    // 必须指定 cwd 与绝对路径：否则被测脚本的相对 require('./test-helpers') 解析失败
    const r = spawnSync('node', [path.join(__dirname, `${name}.cjs`)],
        { encoding: 'utf8', timeout: 600000, cwd: __dirname });
    const out = (r.stdout || '') + (r.stderr || '');
    const secs = ((Date.now() - t0) / 1000).toFixed(0);

    // 各脚本汇总格式不一，统一抽取通过/失败数
    // 各脚本汇总写法不一，按优先级依次尝试；解析不到就退回退出码判断
    const m = out.match(/✅\s*(\d+)\s*(?:通过|PASS)[^\n]*?❌\s*(\d+)/)
           || out.match(/(\d+)\s*PASS\s*\/\s*(\d+)\s*FAIL/)
           || out.match(/PASS:\s*(\d+)[\s\S]*?FAIL:\s*(\d+)/)
           || out.match(/✅\s*(\d+)\s*\|\s*❌\s*(\d+)/)
           || out.match(/正常\s*(\d+)\s*\|\s*故障\s*(\d+)/);
    let pass = m ? Number(m[1]) : null;
    let failNum = m ? Number(m[2]) : null;
    if (!m && /未发现交互故障/.test(out)) { pass = 0; failNum = 0; }
    const fail = failNum;

    // 无法解析汇总时，以退出码为准，避免「解析不到就算过」
    const ok = fail !== null ? fail === 0 : r.status === 0;
    results.push({ name, pass, fail, ok, secs, out });
    console.log(ok ? `✅ ${pass ?? '?'} 通过 (${secs}s)` : `❌ ${fail ?? '异常'} 失败 (${secs}s)`);
}

const bad = results.filter(r => !r.ok);
console.log(`\n${'='.repeat(64)}`);
console.log(`共 ${results.length} 个套件，耗时 ${((Date.now() - started) / 1000 / 60).toFixed(1)} 分钟`);
console.log(`通过 ${results.length - bad.length} | 失败 ${bad.length}`);
if (bad.length) {
    console.log('\n失败套件明细:');
    for (const b of bad) {
        console.log(`\n── ${b.name} ──`);
        console.log(b.out.split('\n').filter(l => /❌|FAIL|Error|error:/i.test(l)).slice(0, 8).join('\n'));
    }
}
console.log('='.repeat(64));
process.exit(bad.length ? 1 : 0);
