<?php
/**
 * API 入口文件 — 路由分发 + 中间件管道
 * 重构版：Middleware → Controller → Service → Repository
 */

// 中间件管道
require_once __DIR__ . '/middleware/CorsMiddleware.php';
require_once __DIR__ . '/middleware/JsonMiddleware.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';
require_once __DIR__ . '/utils/Response.php';

// 1. CORS
CorsMiddleware::handle();

// 2. JSON 响应头
JsonMiddleware::handle();

// 3. 解析请求路径
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH);
$pathParts = array_values(array_filter(explode('/', trim($path, '/'))));
$method = $_SERVER['REQUEST_METHOD'];

// 如果路径不以 api 开头，返回 404
if (empty($pathParts) || $pathParts[0] !== 'api') {
    Response::error('请求的API端点不存在', 'NOT_FOUND', 404);
}

// API 根路径 — 返回状态
if (count($pathParts) === 1) {
    Response::success([
        'version' => '2.0.0',
        'timestamp' => date('Y-m-d H:i:s')
    ], 'OA System API 运行中');
}

// 提取端点和资源 ID
$endpoint = $pathParts[1] ?? '';
$resourceId = isset($pathParts[2]) ? $pathParts[2] : null;
$subEndpoint = isset($pathParts[3]) ? $pathParts[3] : null;

// 连接数据库
require_once __DIR__ . '/config/database.php';
$database = new Database();
$db = $database->getConnection();

if (!$db) {
    Response::error('数据库连接失败', 'DB_ERROR', 500);
}

// 公开路由（不需要认证）
$publicRoutes = ['login', 'register', 'health'];

// 4. 认证中间件
$currentUser = null;
if (!in_array($endpoint, $publicRoutes)) {
    $currentUser = AuthMiddleware::handle(true);
}

// 5. 路由分发
try {
    switch ($endpoint) {
        // ===== 认证 =====
        case 'login':
            require_once __DIR__ . '/services/AuthService.php';
            $authService = new AuthService($db);
            $body = JsonMiddleware::getRequestBody();
            $username = $body['username'] ?? '';
            $password = $body['password'] ?? '';
            $projectId = $body['projectId'] ?? null;

            if (empty($username) || empty($password)) {
                Response::error('用户名和密码不能为空', 'VALIDATION_ERROR');
            }

            $userData = $authService->login($username, $password, (int)$projectId);
            Response::success($userData, '登录成功');
            break;

        case 'logout':
            Response::success(null, '已成功注销');
            break;

        case 'register':
            Response::error('注册功能暂未开放', 'NOT_IMPLEMENTED', 501);
            break;

        case 'user':
            require_once __DIR__ . '/services/AuthService.php';
            $authService = new AuthService($db);
            $userData = $authService->getUserInfo($currentUser['id']);
            Response::success($userData, '获取用户信息成功');
            break;

        case 'switch-project':
            require_once __DIR__ . '/services/AuthService.php';
            $authService = new AuthService($db);
            $body = JsonMiddleware::getRequestBody();
            $projectId = (int)($body['projectId'] ?? 0);

            if (!$projectId) {
                Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            }

            $project = $authService->switchProject($currentUser['id'], $projectId);
            Response::success($project, "已切换到项目: {$project['name']}");
            break;

        // ===== 项目 =====
        case 'projects':
            require_once __DIR__ . '/repositories/ProjectRepository.php';
            $projectRepo = new ProjectRepository($db);

            if ($method === 'GET' && !$resourceId) {
                $projects = $projectRepo->findActive();
                Response::success($projects, '获取项目列表成功');
            } elseif ($method === 'GET' && $resourceId) {
                $project = $projectRepo->findById((int)$resourceId);
                $project ? Response::success($project) : Response::error('项目不存在', 'NOT_FOUND', 404);
            } elseif ($method === 'POST') {
                if (($currentUser['role'] ?? '') !== 'admin') {
                    Response::error('权限不足，仅管理员可创建项目', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                $project = $projectRepo->create($body);
                Response::success($project, '项目创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                if (($currentUser['role'] ?? '') !== 'admin') {
                    Response::error('权限不足，仅管理员可修改项目', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                $project = $projectRepo->update((int)$resourceId, $body);
                $project ? Response::success($project, '项目更新成功') : Response::error('项目不存在', 'NOT_FOUND', 404);
            } elseif ($method === 'DELETE' && $resourceId) {
                if (($currentUser['role'] ?? '') !== 'admin') {
                    Response::error('权限不足，仅管理员可删除项目', 'FORBIDDEN', 403);
                }
                $projectRepo->delete((int)$resourceId);
                Response::success(null, '项目删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 账户 =====
        case 'accounts':
            require_once __DIR__ . '/services/AccountService.php';
            $accountService = new AccountService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET' && !$resourceId) {
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = min(200, max(1, (int)($_GET['limit'] ?? 50)));
                $currency = $_GET['currency'] ?? null;
                $type = $_GET['type'] ?? null;
                $result = $accountService->getAccounts($projectId, $page, $limit, $currency, $type);
                Response::paginated($result['items'], $result['total'], $page, $limit);
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                $body['created_by'] = $currentUser['id'];
                $account = $accountService->createAccount($body);
                Response::success($account, '账户创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $account = $accountService->updateAccount((int)$resourceId, $body, $projectId);
                Response::success($account, '账户更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $accountService->deleteAccount((int)$resourceId, $projectId);
                Response::success(null, '账户删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'account-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET') {
                Response::success($configService->getAccountTypes($projectId), '获取account_types列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->createAccountType($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->updateAccountType((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $configService->deleteAccountType((int)$resourceId, $projectId);
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'account-summary':
            require_once __DIR__ . '/services/AccountService.php';
            $accountService = new AccountService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            Response::success($accountService->getAccountSummary($projectId), '获取账户摘要成功');
            break;

        // ===== 交易 =====
        case 'transactions':
            require_once __DIR__ . '/services/TransactionService.php';
            $txService = new TransactionService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET' && !$resourceId) {
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = min(200, max(1, (int)($_GET['limit'] ?? 50)));
                $filters = array_filter([
                    'type' => $_GET['type'] ?? null,
                    'status' => $_GET['status'] ?? null,
                    'account_id' => $_GET['account_id'] ?? null,
                ]);
                $result = $txService->getTransactions($projectId, $filters, $page, $limit);
                Response::paginated($result['items'], $result['total'], $page, $limit);
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                $body['created_by'] = $currentUser['id'];

                // 内部划款走专用方法
                if (($body['type'] ?? '') === 'transfer') {
                    $result = $txService->createTransfer($body);
                    Response::success($result, '内部划款成功', 201);
                } else {
                    $tx = $txService->createTransaction($body);
                    Response::success($tx, '交易创建成功', 201);
                }
            } elseif ($method === 'GET' && $resourceId) {
                require_once __DIR__ . '/repositories/TransactionRepository.php';
                $repo = new TransactionRepository($db);
                $tx = $repo->findById((int)$resourceId);
                if (!$tx) Response::error('交易不存在', 'NOT_FOUND', 404);
                // 校验交易归属当前项目，防止越权查看
                if ((int)$tx['project_id'] !== $projectId) {
                    Response::error('无权查看该交易', 'FORBIDDEN', 403);
                }
                Response::success($tx);
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'transaction-summary':
            require_once __DIR__ . '/services/TransactionService.php';
            $txService = new TransactionService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            $period = $_GET['period'] ?? 'month';
            if (!in_array($period, ['month', 'year'], true)) {
                Response::error('无效的时间段参数，仅支持 month 或 year', 'VALIDATION_ERROR');
            }
            Response::success($txService->getTransactionSummary($projectId, $period), '获取交易摘要成功');
            break;

        // ===== 配置管理 =====
        case 'currency-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET') {
                Response::success($configService->getCurrencyTypes($projectId), '获取currency_types列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->createCurrencyType($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->updateCurrencyType((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $configService->deleteCurrencyType((int)$resourceId, $projectId);
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'subjects':
        case 'subject-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET') {
                $type = $_GET['type'] ?? null;
                Response::success($configService->getSubjects($projectId, $type), '获取科目列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->createSubject($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->updateSubject((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $configService->deleteSubject((int)$resourceId, $projectId);
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'asset-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET') {
                Response::success($configService->getAssetTypes($projectId), '获取资产类型列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                $body['created_by'] = $currentUser['id'] ?? null;
                Response::success($configService->createAssetType($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->updateAssetType((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $configService->deleteAssetType((int)$resourceId, $projectId);
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'departments':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET') {
                Response::success($configService->getDepartments($projectId), '获取部门列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->createDepartment($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->updateDepartment((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $configService->deleteDepartment((int)$resourceId, $projectId);
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'transaction-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method !== 'GET') {
                Response::error('不支持的请求方法，流水类型请通过科目接口管理', 'METHOD_NOT_ALLOWED', 405);
            }
            // 流水类型通过科目表的 type 字段区分
            if ($resourceId === 'income') {
                Response::success($configService->getSubjects($projectId, 'income'), '获取收入类型成功');
            } elseif ($resourceId === 'expense') {
                Response::success($configService->getSubjects($projectId, 'expense'), '获取支出类型成功');
            } else {
                Response::success($configService->getSubjects($projectId), '获取流水类型成功');
            }
            break;

        // ===== 仪表盘 =====
        case 'dashboard':
            require_once __DIR__ . '/services/TransactionService.php';
            require_once __DIR__ . '/services/AccountService.php';
            $txService = new TransactionService($db);
            $accountService = new AccountService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            $period = $_GET['period'] ?? 'month';
            if (!in_array($period, ['month', 'year'], true)) {
                Response::error('无效的时间段参数，仅支持 month 或 year', 'VALIDATION_ERROR');
            }

            $dashboardEndpoint = $resourceId ?? '';

            switch ($dashboardEndpoint) {
                case 'account-summary':
                    Response::success($accountService->getAccountSummary($projectId), '获取账户摘要成功');
                    break;
                case 'transactions':
                case 'transaction-summary':
                    Response::success($txService->getTransactionSummary($projectId, $period), '获取交易摘要成功');
                    break;
                case 'income-by-subject':
                    Response::success($txService->getIncomeBySubject($projectId, $period), '获取收入科目分析成功');
                    break;
                case 'expense-by-subject':
                    Response::success($txService->getExpenseBySubject($projectId, $period), '获取支出科目分析成功');
                    break;
                case 'expense-by-department':
                    Response::success($txService->getExpenseByDepartment($projectId, $period), '获取部门支出分析成功');
                    break;
                default:
                    // 综合仪表盘数据
                    $summary = [
                        'accountSummary' => $accountService->getAccountSummary($projectId),
                        'transactionSummary' => $txService->getTransactionSummary($projectId, $period),
                        'incomeBySubject' => $txService->getIncomeBySubject($projectId, $period),
                        'expenseBySubject' => $txService->getExpenseBySubject($projectId, $period),
                        'expenseByDepartment' => $txService->getExpenseByDepartment($projectId, $period),
                    ];
                    Response::success($summary, '获取仪表盘数据成功');
                    break;
            }
            break;

        // 兼容旧端点（直接在 /api/ 下的仪表盘路径）
        case 'dashboard-data':
        case 'income-by-subject':
        case 'expense-by-subject':
        case 'expense-by-department':
        case 'recent-transactions':
        case 'project-stats':
            require_once __DIR__ . '/services/TransactionService.php';
            require_once __DIR__ . '/services/AccountService.php';
            $txService = new TransactionService($db);
            $accountService = new AccountService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            $period = $_GET['period'] ?? 'month';
            if (!in_array($period, ['month', 'year'], true)) {
                Response::error('无效的时间段参数，仅支持 month 或 year', 'VALIDATION_ERROR');
            }

            switch ($endpoint) {
                case 'income-by-subject':
                    Response::success($txService->getIncomeBySubject($projectId, $period));
                    break;
                case 'expense-by-subject':
                    Response::success($txService->getExpenseBySubject($projectId, $period));
                    break;
                case 'expense-by-department':
                    Response::success($txService->getExpenseByDepartment($projectId, $period));
                    break;
                default:
                    $summary = [
                        'accountSummary' => $accountService->getAccountSummary($projectId),
                        'transactionSummary' => $txService->getTransactionSummary($projectId, $period),
                    ];
                    Response::success($summary);
                    break;
            }
            break;

        // ===== 用户管理 =====
        case 'users':
            require_once __DIR__ . '/repositories/UserRepository.php';
            $userRepo = new UserRepository($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET' && !$resourceId) {
                $users = $userRepo->findByProjectId($projectId);
                Response::success($users, '获取用户列表成功');
            } elseif ($method === 'GET' && $resourceId) {
                $user = $userRepo->findByIdSafe((int)$resourceId);
                $user ? Response::success($user) : Response::error('用户不存在', 'NOT_FOUND', 404);
            } elseif ($method === 'PUT' && $resourceId) {
                // 仅管理员或本人可修改用户信息
                if (($currentUser['role'] ?? '') !== 'admin' && (int)$resourceId !== (int)$currentUser['id']) {
                    Response::error('权限不足，仅管理员或本人可修改用户信息', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                unset($body['password']); // 不允许通过此接口修改密码
                // 非管理员不允许修改 role 字段
                if (($currentUser['role'] ?? '') !== 'admin') {
                    unset($body['role']);
                }
                $user = $userRepo->update((int)$resourceId, $body);
                if ($user) {
                    unset($user['password']);
                    Response::success($user, '用户更新成功');
                } else {
                    Response::error('用户不存在', 'NOT_FOUND', 404);
                }
            } elseif ($method === 'DELETE' && $resourceId) {
                // 仅管理员可删除用户
                if (($currentUser['role'] ?? '') !== 'admin') {
                    Response::error('权限不足，仅管理员可删除用户', 'FORBIDDEN', 403);
                }
                // 禁止删除自己
                if ((int)$resourceId === (int)$currentUser['id']) {
                    Response::error('不能删除自己的账户', 'VALIDATION_ERROR', 400);
                }
                // 校验被删用户是否属于当前项目
                $checkStmt = $db->prepare("SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?");
                $checkStmt->execute([(int)$resourceId, $projectId]);
                if (!$checkStmt->fetch()) {
                    Response::error('用户不属于当前项目，无权删除', 'FORBIDDEN', 403);
                }
                $userRepo->delete((int)$resourceId);
                Response::success(null, '用户删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 修改密码 =====
        case 'change-password':
            require_once __DIR__ . '/repositories/UserRepository.php';
            $userRepo = new UserRepository($db);
            if ($method !== 'POST') {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            $body = JsonMiddleware::getRequestBody();
            $oldPwd = $body['oldPassword'] ?? '';
            $newPwd = $body['newPassword'] ?? '';
            if (empty($oldPwd) || empty($newPwd)) {
                Response::error('原密码和新密码不能为空', 'VALIDATION_ERROR');
            }
            if (strlen($newPwd) < 6) {
                Response::error('新密码长度不能少于6位', 'VALIDATION_ERROR');
            }
            $userRepo->changePassword($currentUser['id'], $oldPwd, $newPwd);
            Response::success(null, '密码修改成功');
            break;

        // ===== 活动日志 =====
        case 'activity-logs':
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = min(200, max(1, (int)($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            if ($method === 'GET') {
                $stmt = $db->prepare("SELECT * FROM activity_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
                $stmt->execute([$projectId, $limit, $offset]);
                $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $countStmt = $db->prepare("SELECT COUNT(*) FROM activity_logs WHERE project_id = ?");
                $countStmt->execute([$projectId]);
                $total = (int)$countStmt->fetchColumn();

                Response::paginated($logs, $total, $page, $limit);
            } elseif ($method === 'POST') {
                // 仅管理员可手动创建审计日志
                if (($currentUser['role'] ?? '') !== 'admin') {
                    Response::error('权限不足，仅管理员可创建审计日志', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                $stmt = $db->prepare("INSERT INTO activity_logs (action, target_type, target_id, description, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING *");
                $stmt->execute([
                    $body['action'] ?? '',
                    $body['target_type'] ?? 'system',
                    $body['target_id'] ?? null,
                    $body['description'] ?? '',
                    $currentUser['id'],
                    $projectId
                ]);
                $log = $stmt->fetch(PDO::FETCH_ASSOC);
                Response::success($log, '日志记录成功', 201);
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 健康检查 =====
        case 'health':
            Response::success(['status' => 'healthy', 'db' => 'connected'], 'OK');
            break;

        default:
            Response::error("端点 '{$endpoint}' 不存在", 'NOT_FOUND', 404);
    }
} catch (\InvalidArgumentException $e) {
    Response::error($e->getMessage(), 'VALIDATION_ERROR', 400);
} catch (\RuntimeException $e) {
    Response::error($e->getMessage(), 'BUSINESS_ERROR', 400);
} catch (\PDOException $e) {
    error_log("Database error: " . $e->getMessage());
    Response::error('数据库操作失败', 'DB_ERROR', 500);
} catch (\Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    Response::error('服务器内部错误', 'INTERNAL_ERROR', 500);
}
