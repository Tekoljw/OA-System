<?php
/**
 * 服务层测试入口（仅供自动化测试使用）
 *
 * 账本的 HTTP 写入口已关闭：收支必须经审批申请单、划款必须经划款单，
 * 落账都在服务层内部完成。但 TransactionService 的输入校验
 * （类型/状态白名单、外键归属、余额与并发保护）仍需被直接验证，
 * 否则这些规则将失去回归保护。
 *
 * 安全约束：
 *   - 必须显式设置环境变量 OA_ENABLE_TEST_HARNESS=1 才会启用
 *   - 生产镜像不设置该变量，此文件即为 404
 *   - 仍然要求管理员身份认证
 */
require_once __DIR__ . '/middleware/CorsMiddleware.php';
require_once __DIR__ . '/middleware/JsonMiddleware.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';
require_once __DIR__ . '/utils/Response.php';

CorsMiddleware::handle();
JsonMiddleware::handle();

if (getenv('OA_ENABLE_TEST_HARNESS') !== '1') {
    Response::error('请求的API端点不存在', 'NOT_FOUND', 404);
}

$currentUser = AuthMiddleware::handle(true);
if (($currentUser['role'] ?? '') !== 'admin') {
    Response::error('权限不足', 'FORBIDDEN', 403);
}

require_once __DIR__ . '/config/database.php';
$db = (new Database())->getConnection();
if (!$db) Response::error('数据库连接失败', 'DB_ERROR', 500);

require_once __DIR__ . '/services/TransactionService.php';
$svc  = new TransactionService($db);
$body = JsonMiddleware::getRequestBody();
$body['project_id'] = (int)($_GET['projectId'] ?? $body['project_id'] ?? 0);
$body['created_by'] = $currentUser['id'];

try {
    if (($body['type'] ?? '') === 'transfer') {
        Response::success($svc->createTransfer($body), '内部划款成功', 201);
    } else {
        Response::success($svc->createTransaction($body), '交易创建成功', 201);
    }
} catch (\InvalidArgumentException $e) {
    Response::error($e->getMessage(), 'VALIDATION_ERROR', 400);
} catch (\RuntimeException $e) {
    Response::error($e->getMessage(), 'BUSINESS_ERROR', 400);
} catch (\PDOException $e) {
    error_log('Test harness DB error: ' . $e->getMessage());
    Response::error('数据库操作失败', 'DB_ERROR', 500);
}
