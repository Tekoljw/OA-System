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

// 4.5 项目权限校验 — 需要 projectId 的端点统一检查用户归属
$projectBoundEndpoints = [
    'accounts', 'account-types', 'account-summary',
    'transactions', 'transaction-summary', 'transaction-types',
    'currency-types', 'currency-stats', 'subjects', 'subject-types',
    'assets', 'loans', 'asset-types', 'departments', 'dashboard',
    'dashboard-data', 'income-by-subject', 'expense-by-subject',
    'expense-by-department', 'recent-transactions', 'project-stats',
    'activity-logs', 'users', 'shareholders',
    'applications', 'transfers', 'approval-rules', 'exchange-rates',
    'loan-types',
];
if ($currentUser && in_array($endpoint, $projectBoundEndpoints)) {
    $requestedProjectId = (int)($_GET['projectId'] ?? $_POST['projectId'] ?? $currentUser['projectId'] ?? 0);
    if ($requestedProjectId > 0) {
        // 检查用户是否有权访问该项目
        require_once __DIR__ . '/repositories/UserRepository.php';
        $authCheckRepo = new UserRepository($db);
        $isSuperAdmin = $authCheckRepo->isSuperAdmin((int)$currentUser['id']);
        if (!$isSuperAdmin) {
            $userProjects = $authCheckRepo->getUserProjects((int)$currentUser['id'], false);
            $projectIds = array_column($userProjects, 'id');
            if (!in_array($requestedProjectId, $projectIds)) {
                Response::error('无权访问该项目', 'FORBIDDEN', 403);
            }
        }
    }
}

// 4.6 写操作权限校验 — 按端点映射到所需权限项
// 角色可自定义后，不能再直接比较 role === 'admin'：那样无法表达
// 「某个自定义角色能不能做这件事」。改为查该角色是否具备对应权限。
// 注意：transactions / users 有更细粒度的规则（见各自分支），不在此处统一拦截
$writePermissionMap = [
    // 账户的新增/编辑只有会计能做，其他角色只读（view_accounts 仍可查看）
    'accounts'       => 'manage_accounting',
    'account-types'  => 'manage_configurations',
    'subjects'       => 'manage_configurations',
    'subject-types'  => 'manage_configurations',
    'asset-types'    => 'manage_configurations',
    'currency-types' => 'manage_configurations',
    'approval-rules' => 'manage_configurations',
    'departments'    => 'manage_personnel',
    'assets'         => 'manage_assets',
    'loans'          => 'manage_assets',
    'projects'       => 'manage_configurations',
    'shareholders'   => 'manage_configurations',
    'activity-logs'  => 'manage_personnel',
];
require_once __DIR__ . '/services/RoleService.php';
$roleService = new RoleService($db);

if ($currentUser
    && isset($writePermissionMap[$endpoint])
    && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)
    && !$roleService->can($currentUser, $writePermissionMap[$endpoint])
) {
    Response::error('权限不足，当前角色无权执行该操作', 'FORBIDDEN', 403);
}

/**
 * 账户请求体归一化。
 * 前端表单提交的是 camelCase（accountNumber/currencyType/accountType），
 * 且账户类型传的是显示名（如「活期账户」）而非库中的 code（current），
 * 此前两者都对不上，通过界面新建账户必然报「账户类型不能为空」。
 */
function normalizeAccountBody(array $body): array {
    $map = [
        'accountNumber' => 'account_number',
        'currencyType'  => 'currency_type',
        'accountType'   => 'account_type',
        'initialBalance'=> 'initial_balance',
        'openDate'      => 'open_date',
        'bank'          => 'bank_name',
        'limit'         => 'credit_limit',
    ];
    foreach ($map as $from => $to) {
        if (array_key_exists($from, $body) && !array_key_exists($to, $body)) {
            $body[$to] = $body[$from];
        }
        unset($body[$from]);
    }
    return $body;
}

/**
 * 划款请求体归一化。
 * 前端按 TransferData 提交 camelCase（fromAccountId/toAmount/fees/…），
 * 后端使用 snake_case，两者对不上会报「未指定部门」等误导性错误。
 */
function normalizeTransferBody(array $body): array {
    $map = [
        'fromAccountId'        => 'from_account_id',
        'toAccountId'          => 'to_account_id',
        'fromAccount'          => 'from_account_id',
        'toAccount'            => 'to_account_id',
        'toAmount'             => 'to_amount',
        'exchangeLoss'         => 'exchange_loss',
        'actualExchangeRate'   => 'actual_exchange_rate',
        'officialExchangeRate' => 'official_exchange_rate',
        'departmentId'         => 'department_id',
        'repaymentDate'        => 'repayment_date',
    ];
    foreach ($map as $from => $to) {
        if (array_key_exists($from, $body) && !array_key_exists($to, $body)) {
            $body[$to] = $body[$from];
        }
        unset($body[$from]);
    }
    return $body;
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
                $body = JsonMiddleware::getRequestBody();
                $project = $projectRepo->create($body);
                Response::success($project, '项目创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $project = $projectRepo->update((int)$resourceId, $body);
                $project ? Response::success($project, '项目更新成功') : Response::error('项目不存在', 'NOT_FOUND', 404);
            } elseif ($method === 'DELETE' && $resourceId) {
                $assoc = $projectRepo->hasAssociatedData((int)$resourceId);
                if ($assoc['accounts'] > 0 || $assoc['transactions'] > 0) {
                    Response::error(
                        sprintf('该项目下有 %d 个账户和 %d 条交易记录，无法删除', $assoc['accounts'], $assoc['transactions']),
                        'CONFLICT', 409
                    );
                }
                if (!$projectRepo->delete((int)$resourceId)) {
                    Response::error('项目不存在', 'NOT_FOUND', 404);
                }
                Response::success(null, '项目删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 股东管理 =====
        case 'shareholders':
            require_once __DIR__ . '/services/ShareholderService.php';
            $shareholderService = new ShareholderService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($projectId <= 0) {
                Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            }

            // 子路由处理
            $subAction = $_GET['action'] ?? '';

            if ($subAction === 'contribution-summary') {
                $result = $shareholderService->getContributionAnalysis($projectId);
                Response::success($result, '入资汇总');
            } elseif ($subAction === 'dividend-summary') {
                $result = $shareholderService->getDividendCalculation($projectId);
                Response::success($result, '分红计算');
            } elseif ($method === 'GET' && !$resourceId) {
                $shareholders = $shareholderService->getShareholders($projectId);
                Response::success($shareholders, '获取股东列表成功');
            } elseif ($method === 'GET' && $resourceId) {
                $repo = new ShareholderRepository($db);
                $shareholder = $repo->findById((int)$resourceId);
                if (!$shareholder || (int)$shareholder['project_id'] !== $projectId) {
                    Response::error('股东不存在', 'NOT_FOUND', 404);
                }
                Response::success($shareholder);
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                $body['created_by'] = $currentUser['id'];
                $shareholder = $shareholderService->create($body);
                Response::success($shareholder, '股东添加成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $shareholder = $shareholderService->update((int)$resourceId, $body, $projectId);
                Response::success($shareholder, '股东更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $shareholderService->delete((int)$resourceId, $projectId);
                Response::success(null, '股东删除成功');
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
                $limit = (($__l = (int)($_GET['limit'] ?? 50)) > 0 ? min(200, $__l) : 50);
                $currency = $_GET['currency'] ?? null;
                $type = $_GET['type'] ?? null;
                $result = $accountService->getAccounts($projectId, $page, $limit, $currency, $type);
                Response::paginated($result['items'], $result['total'], $page, $limit);
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body = normalizeAccountBody($body);
                $body['project_id'] = $projectId;
                $body['created_by'] = $currentUser['id'];
                $account = $accountService->createAccount($body);
                Response::success($account, '账户创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = normalizeAccountBody(JsonMiddleware::getRequestBody());
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
                // 删不到说明目标不存在或不属于当前项目，不能报「删除成功」，
                // 否则并发场景下另一人已删除时前端仍会显示成功
                if (!$configService->deleteAccountType((int)$resourceId, $projectId)) {
                    Response::error('账户类型不存在', 'NOT_FOUND', 404);
                }
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
                $limit = (($__l = (int)($_GET['limit'] ?? 50)) > 0 ? min(200, $__l) : 50);
                $filters = array_filter([
                    'type' => $_GET['type'] ?? null,
                    'status' => $_GET['status'] ?? null,
                    'account_id' => $_GET['account_id'] ?? null,
                    'transaction_type_code' => $_GET['transactionTypeCode'] ?? null,
                    'search' => $_GET['search'] ?? $_GET['searchTerm'] ?? null,
                    'date'   => $_GET['date'] ?? null,
                ]);
                $result = $txService->getTransactions($projectId, $filters, $page, $limit);
                Response::paginated($result['items'], $result['total'], $page, $limit);
            } elseif ($method === 'POST') {
                // 账本只能由审批流产生：收入/支出经申请单执行落账，
                // 内部划款经划款单执行落账，两者都在服务层内部调用
                // TransactionService，不经过本路由。
                // 此前这里对任何登录用户开放，等于绕过审批凭空造收支并改动余额。
                Response::error(
                    '不能直接创建流水。收入/支出请提交申请单（流程管理 → 我的申请），'
                    . '内部划款请提交划款单，审批通过并执行后自动生成流水。',
                    'FORBIDDEN', 403
                );
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

        // 按币种统计收支与余额 — /api/currency-stats/{CODE}
        case 'currency-stats':
            require_once __DIR__ . '/services/TransactionService.php';
            $txService = new TransactionService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            if (!$resourceId) Response::error('币种代码不能为空', 'VALIDATION_ERROR');
            Response::success($txService->getCurrencyStats($projectId, $resourceId), '获取币种统计成功');
            break;

        // ===== 审批规则配置（仅管理员，由 4.6 守卫统一拦截写操作）=====
        case 'approval-rules':
            require_once __DIR__ . '/services/ApprovalService.php';
            $approvalSvc = new ApprovalService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');

            if ($method === 'GET') {
                Response::success($approvalSvc->listRules($projectId), '获取审批规则成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                Response::success($approvalSvc->createRule($projectId, $body), '规则创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                Response::success($approvalSvc->updateRule((int)$resourceId, $projectId, $body), '规则更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $approvalSvc->deleteRule((int)$resourceId, $projectId);
                Response::success(null, '规则删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 申请单（审批工作流）=====
        case 'applications':
            require_once __DIR__ . '/services/ApplicationService.php';
            $appService = new ApplicationService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');

            if ($method === 'GET' && !$resourceId) {
                Response::success($appService->getApplications($projectId, $_GET, $currentUser), '获取申请列表成功');
            } elseif ($method === 'GET' && $resourceId && $subEndpoint === 'approvals') {
                require_once __DIR__ . '/services/ApprovalService.php';
                $approvalSvc = new ApprovalService($db);
                Response::success($approvalSvc->getApprovals('application_id', (int)$resourceId), '获取审批进度成功');
            } elseif ($method === 'GET' && $resourceId) {
                Response::success($appService->getApplication((int)$resourceId, $projectId), '获取申请详情成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id']   = $projectId;
                $body['submitter_id'] = $body['submitterId'] ?? $currentUser['id'];
                $body['department_id'] = $body['departmentId'] ?? $body['department_id'] ?? null;
                // 空串不能直接写进 date 列（invalid input syntax for type date）
                $body['due_date']      = ($body['dueDate'] ?? '') !== '' ? $body['dueDate'] : null;
                $body['related_party'] = ($body['relatedParty'] ?? '') !== '' ? $body['relatedParty'] : null;
                $body['type']          = $body['applicationType'] ?? $body['type'] ?? null;
                $body['shareholder_id'] = $body['shareholderId'] ?? $body['shareholder_id'] ?? null;
                $body['allocated_account_id'] = $body['accountId'] ?? $body['allocated_account_id'] ?? null;
                // 科目在提交时就选好了，直接预置为归账结果，
                // 会计归账时只需指定账户，不必再挑一次科目
                $body['allocated_subject_id'] = $body['subjectId'] ?? $body['subject_id']
                    ?? $body['allocated_subject_id'] ?? null;
                Response::success($appService->create($body), '申请提交成功', 201);
            } elseif ($method === 'PUT' && $resourceId && $subEndpoint === 'status') {
                $body = JsonMiddleware::getRequestBody();
                $decision = $body['status'] ?? '';
                Response::success(
                    $appService->act((int)$resourceId, $projectId, $decision, $body['comment'] ?? '', $currentUser),
                    '审批完成'
                );
            } elseif ($method === 'PUT' && $resourceId && $subEndpoint === 'allocate') {
                // 归账＝指定钱从哪个账户进出，是会计的职责
                if (!$roleService->can($currentUser, 'manage_pending_accounting')) {
                    Response::error('权限不足，归账只能由会计操作', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                Response::success($appService->allocate((int)$resourceId, $projectId, $body, $currentUser), '归帐完成');
            } elseif ($method === 'PUT' && $resourceId && $subEndpoint === 'execute') {
                $body = JsonMiddleware::getRequestBody();
                Response::success($appService->execute((int)$resourceId, $projectId, $body, $currentUser), '执行完成');
            } elseif ($method === 'DELETE' && $resourceId) {
                $appService->delete((int)$resourceId, $projectId, $currentUser);
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 内部划款单 =====
        case 'transfers':
            require_once __DIR__ . '/services/TransferService.php';
            $trService = new TransferService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');

            if ($method === 'GET' && !$resourceId) {
                Response::success($trService->getTransfers($projectId, $_GET), '获取划款列表成功');
            } elseif ($method === 'GET' && $resourceId) {
                Response::success($trService->getTransfer((int)$resourceId, $projectId), '获取划款详情成功');
            } elseif ($method === 'POST' && !$resourceId) {
                $body = normalizeTransferBody(JsonMiddleware::getRequestBody());
                $body['project_id']   = $projectId;
                $body['submitter_id'] = $currentUser['id'];
                Response::success($trService->create($body), '划款单提交成功', 201);
            } elseif ($resourceId && in_array($subEndpoint, ['approve', 'reject'], true)) {
                $body = JsonMiddleware::getRequestBody();
                $decision = $subEndpoint === 'approve' ? 'approved' : 'rejected';
                Response::success(
                    $trService->act((int)$resourceId, $projectId, $decision, $body['comment'] ?? '', $currentUser),
                    '审批完成'
                );
            } elseif ($method === 'PUT' && $resourceId && $subEndpoint === 'status') {
                $body = JsonMiddleware::getRequestBody();
                Response::success(
                    $trService->act((int)$resourceId, $projectId, $body['status'] ?? '', $body['comment'] ?? '', $currentUser),
                    '审批完成'
                );
            } elseif ($resourceId && $subEndpoint === 'execute') {
                Response::success($trService->execute((int)$resourceId, $projectId, $currentUser), '执行完成');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
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
                // 删不到说明目标不存在或不属于当前项目，不能报「删除成功」，
                // 否则并发场景下另一人已删除时前端仍会显示成功
                if (!$configService->deleteCurrencyType((int)$resourceId, $projectId)) {
                    Response::error('币种不存在', 'NOT_FOUND', 404);
                }
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
                // 申请单表单按一级类型取二级科目池；配置页不传则返回全量
                $ttCode = $_GET['transactionTypeCode'] ?? null;
                Response::success($configService->getSubjects($projectId, $type, $ttCode), '获取科目列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->createSubject($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                Response::success($configService->updateSubject((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                // 删不到说明目标不存在或不属于当前项目，不能报「删除成功」，
                // 否则并发场景下另一人已删除时前端仍会显示成功
                if (!$configService->deleteSubject((int)$resourceId, $projectId)) {
                    Response::error('科目不存在', 'NOT_FOUND', 404);
                }
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 资产记录 =====
        case 'assets':
            require_once __DIR__ . '/services/AssetService.php';
            $assetService = new AssetService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');

            if ($method === 'GET' && !$resourceId) {
                Response::success($assetService->getAssets($projectId, $_GET), '获取资产列表成功');
            } elseif ($method === 'GET' && $resourceId) {
                Response::success($assetService->getAsset((int)$resourceId, $projectId), '获取资产详情成功');
            } elseif ($method === 'POST' && $resourceId && $subEndpoint === 'depreciate') {
                // 报损/减值是把资产做平的最后一步，只能会计操作
                if (!$roleService->can($currentUser, 'manage_accounting')) {
                    Response::error('权限不足，资产报损/减值只能由会计操作', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                Response::success(
                    $assetService->depreciate((int)$resourceId, $projectId, $body, $currentUser),
                    '核销成功'
                );
            } elseif ($method === 'POST' && !$resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id']    = $projectId;
                $body['submitter_id']  = $currentUser['id'];
                $body['asset_type_id'] = $body['assetTypeId']  ?? $body['asset_type_id']  ?? null;
                $body['department_id'] = $body['departmentId'] ?? $body['department_id'] ?? null;
                $body['unit_price']    = $body['unitPrice']    ?? $body['unit_price']    ?? 0;
                $body['currency_type'] = $body['currencyType'] ?? $body['currency_type'] ?? 'CNY';
                Response::success($assetService->create($body), '资产创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                if (isset($body['unitPrice']))    $body['unit_price']    = $body['unitPrice'];
                if (isset($body['assetTypeId']))  $body['asset_type_id'] = $body['assetTypeId'];
                if (isset($body['departmentId'])) $body['department_id'] = $body['departmentId'];
                Response::success($assetService->update((int)$resourceId, $body, $projectId, $currentUser), '资产更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                $assetService->delete((int)$resourceId, $projectId, $currentUser);
                Response::success(null, '资产删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 借贷记录 =====
        case 'loans':
            require_once __DIR__ . '/services/LoanService.php';
            $loanService = new LoanService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');

            if ($method === 'GET' && !$resourceId) {
                Response::success($loanService->getLoans($projectId, $_GET), '获取借贷记录成功');
            } elseif ($method === 'GET' && $resourceId) {
                Response::success($loanService->getLoan((int)$resourceId, $projectId), '获取借贷详情成功');
            } elseif ($method === 'POST' && $resourceId && $subEndpoint === 'settle') {
                // 手工销账（坏账、不打算还的贷款）只能会计操作；
                // 正常还款请走还款流水，由归账执行时自动回冲
                if (!$roleService->can($currentUser, 'manage_accounting')) {
                    Response::error('权限不足，手工销账只能由会计操作', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                Response::success($loanService->settle((int)$resourceId, $projectId, $body, $currentUser), '结算成功');
            } elseif ($method === 'POST' && !$resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id']     = $projectId;
                $body['submitter_id']   = $currentUser['id'];
                $body['department_id']  = $body['departmentId']   ?? $body['department_id']  ?? null;
                $body['repayment_date'] = $body['repaymentDate']  ?? $body['repayment_date'] ?? null;
                Response::success($loanService->create($body), '借贷记录创建成功', 201);
            } elseif ($method === 'DELETE' && $resourceId) {
                $loanService->delete((int)$resourceId, $projectId, $currentUser);
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
                // 删不到说明目标不存在或不属于当前项目，不能报「删除成功」，
                // 否则并发场景下另一人已删除时前端仍会显示成功
                if (!$configService->deleteAssetType((int)$resourceId, $projectId)) {
                    Response::error('资产类型不存在', 'NOT_FOUND', 404);
                }
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        case 'departments':
            // 部门成员：界面上展开部门就会请求它，此前服务端没有这个路由，
            // 请求落到部门列表分支，返回的是全部部门，成员永远是空的
            if ($method === 'GET' && $resourceId && $subEndpoint === 'members') {
                require_once __DIR__ . '/repositories/UserRepository.php';
                $memberRepo = new UserRepository($db);
                $pid = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
                Response::success(
                    $memberRepo->findByDepartment((int)$resourceId, $pid),
                    '获取部门成员成功'
                );
            }
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);

            if ($method === 'GET') {
                Response::success($configService->getDepartments($projectId), '获取部门列表成功');
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                $body['manager_id'] = $body['managerId'] ?? $body['manager_id'] ?? null;
                Response::success($configService->createDepartment($body), '创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                if (array_key_exists('managerId', $body)) $body['manager_id'] = $body['managerId'];
                Response::success($configService->updateDepartment((int)$resourceId, $body), '更新成功');
            } elseif ($method === 'DELETE' && $resourceId) {
                // 删不到说明目标不存在或不属于当前项目，不能报「删除成功」，
                // 否则并发场景下另一人已删除时前端仍会显示成功
                if (!$configService->deleteDepartment((int)$resourceId, $projectId)) {
                    Response::error('部门不存在', 'NOT_FOUND', 404);
                }
                Response::success(null, '删除成功');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 一级流水类型（系统固定，只读） =====
        // 一笔流水先选一级类型，二级选项由它的 second_level 决定从哪个池子里取；
        // derives 决定归账执行后要不要衍生资产/借贷/股东记录。
        case 'transaction-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);

            if ($method !== 'GET') {
                Response::error('流水类型是系统固定的，不能增删改', 'FORBIDDEN', 403);
            }
            $direction = in_array($resourceId, ['income', 'expense'], true) ? $resourceId : null;
            Response::success($configService->getTransactionTypes($direction), '获取流水类型成功');
            break;

        // ===== 借贷分类（系统固定，只读） =====
        case 'loan-types':
            require_once __DIR__ . '/services/ConfigService.php';
            $configService = new ConfigService($db);

            if ($method !== 'GET') {
                Response::error('借贷分类是系统固定的，不能增删改', 'FORBIDDEN', 403);
            }
            $dir = in_array($_GET['direction'] ?? '', ['lend', 'borrow'], true) ? $_GET['direction'] : null;
            Response::success($configService->getLoanTypes($dir), '获取借贷分类成功');
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

        // ===== 角色管理（系统预定义角色） =====
        // ===== 汇率 =====
        case 'exchange-rates':
            require_once __DIR__ . '/services/ExchangeRateService.php';
            $rateSvc = new ExchangeRateService($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');

            if ($method === 'GET') {
                Response::success($rateSvc->listRates($projectId), '获取汇率成功');
            } elseif ($method === 'POST' && $resourceId === 'refresh') {
                if (!$roleService->can($currentUser, 'manage_accounting')) {
                    Response::error('权限不足，汇率只能由会计维护', 'FORBIDDEN', 403);
                }
                Response::success($rateSvc->refreshAuto($projectId), '汇率刷新完成');
            } elseif ($method === 'PUT' && $resourceId) {
                if (!$roleService->can($currentUser, 'manage_accounting')) {
                    Response::error('权限不足，汇率只能由会计维护', 'FORBIDDEN', 403);
                }
                Response::success(
                    $rateSvc->updateSettings((int)$resourceId, $projectId, JsonMiddleware::getRequestBody()),
                    '汇率已更新'
                );
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 用户展示本位币偏好 =====
        case 'base-currency':
            require_once __DIR__ . '/repositories/UserRepository.php';
            $uRepo = new UserRepository($db);

            if ($method === 'GET') {
                Response::success(['baseCurrency' => $uRepo->getBaseCurrency((int)$currentUser['id'])], 'OK');
            } elseif ($method === 'PUT') {
                $body = JsonMiddleware::getRequestBody();
                $code = strtoupper(trim((string)($body['baseCurrency'] ?? '')));
                // 与币种管理保持一致：允许数字代码
                if (!preg_match('/^[A-Z0-9]{2,10}$/', $code)) {
                    Response::error('币种代码无效', 'VALIDATION_ERROR');
                }
                $uRepo->setBaseCurrency((int)$currentUser['id'], $code);
                Response::success(['baseCurrency' => $code], '本位币已切换');
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

        // ===== 角色与权限 =====
        case 'roles':
            $roleSvc = $roleService; // 已在 4.6 处实例化

            if ($method === 'GET' && $resourceId === 'permissions') {
                Response::success($roleSvc->allPermissions(), '获取权限项成功');
            } elseif ($method === 'GET' && !$resourceId) {
                Response::success($roleSvc->listRoles(), '获取角色列表成功');
            } elseif ($method === 'GET' && $resourceId) {
                $all = $roleSvc->listRoles();
                $found = null;
                foreach ($all as $r) { if ((string)$r['id'] === (string)$resourceId) { $found = $r; break; } }
                $found ? Response::success($found) : Response::error('角色不存在', 'NOT_FOUND', 404);
            } elseif (in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
                // 角色配置属于人员管理范畴
                if (!$roleSvc->can($currentUser, 'manage_personnel')) {
                    Response::error('权限不足，无权管理角色', 'FORBIDDEN', 403);
                }
                if ($method === 'POST') {
                    Response::success($roleSvc->createRole(JsonMiddleware::getRequestBody()), '角色创建成功', 201);
                } elseif ($method === 'PUT' && $resourceId) {
                    Response::success($roleSvc->updateRole((int)$resourceId, JsonMiddleware::getRequestBody()), '角色更新成功');
                } elseif ($method === 'DELETE' && $resourceId) {
                    $roleSvc->deleteRole((int)$resourceId);
                    Response::success(null, '角色删除成功');
                } else {
                    Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
                }
            } else {
                Response::error('不支持的请求方法', 'METHOD_NOT_ALLOWED', 405);
            }
            break;

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
            } elseif ($method === 'POST' && !$resourceId) {
                // 内部系统不开放自助注册，用户由具备人员管理权限的角色创建
                if (!$roleService->can($currentUser, 'manage_personnel')) {
                    Response::error('权限不足，无权创建用户', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                if (empty($body['username']) || empty($body['password'])) {
                    Response::error('用户名和密码不能为空', 'VALIDATION_ERROR');
                }
                if (strlen($body['password']) < 6) {
                    Response::error('密码长度不能少于6位', 'VALIDATION_ERROR');
                }
                // 角色可自定义后不能再写死白名单：那样新建的角色（含系统角色「会计」）
                // 都无法分配给用户，角色管理形同虚设
                $roleCode = $body['role'] ?? 'user';
                if (!$roleService->roleExists($roleCode)) {
                    Response::error('角色无效：' . $roleCode, 'VALIDATION_ERROR');
                }
                $newUser = $userRepo->createWithProject([
                    'username'  => $body['username'],
                    'password'  => $body['password'],
                    'full_name' => $body['fullName'] ?? $body['full_name'] ?? '',
                    // email 有唯一约束，空串会让第二个用户撞 users_email_key，须转 NULL
                    'email'     => ($body['email'] ?? '') !== '' ? $body['email'] : null,
                    'role'      => $body['role'] ?? 'user',
                    'is_active' => ($body['status'] ?? 'active') === 'active',
                    // 用户管理界面一直有部门下拉，此前提交上来直接被丢弃
                    'department_id' => $body['departmentId'] ?? $body['department_id'] ?? null,
                ], $projectId);
                Response::success($newUser, '用户创建成功', 201);
            } elseif ($method === 'PUT' && $resourceId) {
                // 具备人员管理权限者可改任何人，其余只能改自己
                $canManagePersonnel = $roleService->can($currentUser, 'manage_personnel');
                if (!$canManagePersonnel && (int)$resourceId !== (int)$currentUser['id']) {
                    Response::error('权限不足，只能修改本人信息', 'FORBIDDEN', 403);
                }
                $body = JsonMiddleware::getRequestBody();
                // 字段白名单：仅允许修改安全的字段
                $body['department_id'] = $body['departmentId'] ?? $body['department_id'] ?? null;
                $allowedFields = ['full_name', 'email', 'notes'];
                // 具备人员管理权限者额外可修改 role、启用状态、用户名与部门归属
                if ($canManagePersonnel) {
                    $allowedFields = array_merge($allowedFields, ['role', 'is_active', 'username', 'department_id']);
                }
                $safeBody = array_intersect_key($body, array_flip($allowedFields));

                // 重置密码：界面上的用户编辑弹窗一直有密码输入框，但 password 不在白名单里，
                // 提示「更新成功」而密码分文未动 —— 用户拿新密码登不进去，旧密码照样能用。
                // 本人可改自己的；改他人的需要人员管理权限。
                if (($body['password'] ?? '') !== '') {
                    if (!$canManagePersonnel && (int)$resourceId !== (int)$currentUser['id']) {
                        Response::error('权限不足，无权重置他人密码', 'FORBIDDEN', 403);
                    }
                    if (strlen($body['password']) < 6) {
                        Response::error('密码长度不能少于6位', 'VALIDATION_ERROR');
                    }
                    $userRepo->resetPassword((int)$resourceId, $body['password']);
                }

                if (empty($safeBody)) {
                    // 只改了密码也算有效操作
                    if (($body['password'] ?? '') !== '') {
                        $user = $userRepo->findByIdSafe((int)$resourceId);
                        $user ? Response::success($user, '用户更新成功')
                              : Response::error('用户不存在', 'NOT_FOUND', 404);
                    }
                    Response::error('无有效的可修改字段', 'VALIDATION_ERROR');
                }
                $user = $userRepo->update((int)$resourceId, $safeBody);
                if ($user) {
                    unset($user['password']);
                    Response::success($user, '用户更新成功');
                } else {
                    Response::error('用户不存在', 'NOT_FOUND', 404);
                }
            } elseif ($method === 'DELETE' && $resourceId) {
                // 删除用户需要人员管理权限
                if (!$roleService->can($currentUser, 'manage_personnel')) {
                    Response::error('权限不足，无权删除用户', 'FORBIDDEN', 403);
                }
                // 禁止删除自己
                if ((int)$resourceId === (int)$currentUser['id']) {
                    Response::error('不能删除自己的账户', 'VALIDATION_ERROR', 400);
                }
                // 校验被删用户是否属于当前项目
                if (!$userRepo->belongsToProject((int)$resourceId, $projectId)) {
                    Response::error('用户不属于当前项目，无权删除', 'FORBIDDEN', 403);
                }
                if (!$userRepo->delete((int)$resourceId)) {
                    Response::error('用户不存在', 'NOT_FOUND', 404);
                }
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
            require_once __DIR__ . '/repositories/ActivityLogRepository.php';
            $logRepo = new ActivityLogRepository($db);
            $projectId = (int)($_GET['projectId'] ?? $currentUser['projectId'] ?? 0);
            if ($projectId <= 0) Response::error('项目ID不能为空', 'VALIDATION_ERROR');
            $page  = max(1, (int)($_GET['page'] ?? 1));
            $limit = (($__l = (int)($_GET['limit'] ?? 20)) > 0 ? min(200, $__l) : 20);

            if ($method === 'GET') {
                Response::paginated(
                    $logRepo->findByProject($projectId, $page, $limit),
                    $logRepo->countByProject($projectId),
                    $page, $limit
                );
            } elseif ($method === 'POST') {
                $body = JsonMiddleware::getRequestBody();
                $body['project_id'] = $projectId;
                $body['user_id']    = $currentUser['id'];
                Response::success($logRepo->record($body), '日志记录成功', 201);
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
} catch (\PDOException $e) {
    // 必须排在 RuntimeException 之前：PDOException 是它的子类，
    // 顺序反了会把整段 SQLSTATE 原文（含表名、约束名、SQL 片段）
    // 当成业务提示直接返回给用户
    error_log("Database error: " . $e->getMessage());

    // 几类常见约束翻译成人话再返回。只说「数据库操作失败」，
    // 用户不知道是名称太长还是编码重复，改都不知道从哪改起；
    // 但也不能把原文抛出去，那会暴露表结构
    $sqlState = $e->getCode();
    $raw      = $e->getMessage();
    if ($sqlState === '23505') {
        Response::error('该编码或名称已存在，请换一个', 'DUPLICATE', 400);
    }
    if ($sqlState === '22001') {
        Response::error('输入内容过长，请缩短后重试', 'VALUE_TOO_LONG', 400);
    }
    if ($sqlState === '23503') {
        Response::error('关联的数据不存在，或该记录仍被其他数据引用', 'FK_VIOLATION', 400);
    }
    if ($sqlState === '23514') {
        Response::error('输入的数值不在允许范围内', 'CHECK_VIOLATION', 400);
    }
    if ($sqlState === '23502') {
        Response::error('必填项缺失，请检查表单', 'NOT_NULL_VIOLATION', 400);
    }
    Response::error('数据库操作失败', 'DB_ERROR', 500);
} catch (\RuntimeException $e) {
    Response::error($e->getMessage(), 'BUSINESS_ERROR', 400);
} catch (\Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    Response::error('服务器内部错误', 'INTERNAL_ERROR', 500);
}
