/**
 * 测试共享工具。
 *
 * 此前每个用例各自维护一份清理白名单，任一处漏掉某个前缀，
 * 股东比例就会被别的用例占满（上限 100%），导致后续用例连环失败，
 * 且看起来像产品回归。统一到这里，新增用例只需登记自己的前缀。
 */
const { execFileSync } = require('child_process');

/** 所有用例使用的测试数据名称前缀，新增用例请在此登记 */
const TEST_PREFIXES = [
    '多角色股东', 'FT', 'ED', 'SH探测', '测试股东', '项目B股东',
    'R1', 'R2', 'M3测试', 'M4', '空码', '码测', '删除语义测试', '唯一码',
];

function likeClause(column) {
    return TEST_PREFIXES.map(p => `${column} LIKE '${p}%'`).join(' OR ');
}

/** 执行一段 SQL；失败时完整暴露错误（截断的提示曾让问题长期被忽略） */
function psql(sql, label = '清理') {
    try {
        execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres',
            '-d', 'oa_system', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
        return true;
    } catch (e) {
        const detail = e.stderr ? e.stderr.toString() : e.message;
        console.log(`  ⚠️ ${label}失败:\n` + detail.split('\n').filter(l => /ERROR|DETAIL/.test(l)).join('\n'));
        return false;
    }
}

/**
 * 清空项目 1 的测试股东。
 * 股份比例上限 100%，任何残留都会让后续用例无法创建股东。
 * 必须先删引用方（交易）再删被引用方，否则撞外键约束整批中止。
 */
function resetShareholders(projectId = 1) {
    const where = `project_id=${projectId} AND (${likeClause('name')})`;
    const ok = psql(`
        DELETE FROM transactions WHERE shareholder_id IN (SELECT id FROM shareholders WHERE ${where});
        DELETE FROM shareholders WHERE ${where};`, '股东清理');
    if (ok) console.log('  🧹 已清理测试股东');
    return ok;
}

module.exports = { TEST_PREFIXES, likeClause, psql, resetShareholders };
