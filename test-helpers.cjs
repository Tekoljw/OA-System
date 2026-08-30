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
    '多角色股东', 'FT', 'ED', 'SH探测', '测试股东', '项目B股东', '审批入资股东', 'TX',
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


/**
 * 通过审批流产生一笔收入/支出流水。
 *
 * 账本只能由审批流写入：POST /api/transactions 已关闭，
 * 收支必须提交申请单，经审批与执行后才落账。
 * 测试需要准备账面数据时统一走这里，不要绕过业务规则直接写库。
 *
 * @param ctx.api        (method, path, token, body) => Promise<响应>
 * @param ctx.tokens     { admin, admin2, manager } 三种身份，用于走完会签
 * @returns {Promise<{ok:boolean, applicationId?:number, reason?:string}>}
 */
async function createTransactionViaApproval(ctx, {
    projectId = 1, type, amount, accountId, subjectId,
    departmentId = 1, shareholderId = null, title,
}) {
    const { api, tokens } = ctx;
    const app = await api('POST', `/api/applications?projectId=${projectId}`, tokens.admin, {
        type, title: title || `自动化-${type}-${amount}`, amount,
        departmentId, shareholderId, accountId, subjectId,
    });
    if (app.status !== 201) {
        return { ok: false, reason: app?.error?.message || app?.message || '提交申请失败' };
    }
    const id = app.data.id;

    // 审批链最多三级：部门主管 → 管理员 ×N 会签，逐个身份尝试推进
    for (const who of [tokens.manager, tokens.admin, tokens.admin2]) {
        if (!who) continue;
        const cur = await api('GET', `/api/applications/${id}?projectId=${projectId}`, tokens.admin);
        if (cur?.data?.status !== 'pending') break;
        await api('PUT', `/api/applications/${id}/status?projectId=${projectId}`, who, { status: 'approved' });
    }

    const exec = await api('PUT', `/api/applications/${id}/execute?projectId=${projectId}`, tokens.admin, {});
    if (exec.status !== 200) {
        return { ok: false, applicationId: id, reason: exec?.error?.message || '执行失败' };
    }
    return { ok: true, applicationId: id };
}

module.exports = {
    TEST_PREFIXES, likeClause, psql, resetShareholders,
    createTransactionViaApproval,
};
