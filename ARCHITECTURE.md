# OA-System 架构重新规划方案

**日期**: 2026-08-27
**状态**: 待审核

---

## 一、现有问题总结

| 问题类别 | 现状 | 影响 |
|---------|------|------|
| API配置 | 7个重复文件 | 调用不一致，维护困难 |
| 页面组件 | 18+个重复版本 | 代码冗余70%+ |
| Context | 4个，职责重叠 | 状态管理混乱 |
| 后端控制器 | 500-660行，无分层 | 业务逻辑与HTTP混合 |
| 前后端通信 | 无统一约定 | 字段名、格式不一致 |
| 配置管理 | 硬编码 | 无法跨环境 |
| 测试文件 | 混在生产代码中 | 构建时污染 |

---

## 二、新架构总览

```
┌──────────────────────────────────────────────────────────┐
│                      浏览器端                              │
│                                                          │
│  React 18 + TypeScript + Vite                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Pages   │→ │  Hooks   │→ │ API层    │               │
│  │ (20个)   │  │ (统一)   │  │ (1个)    │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│       ↕              ↕                                   │
│  ┌──────────┐  ┌──────────┐                              │
│  │Components│  │ Contexts │                              │
│  │ (UI组件) │  │ (2个)    │                              │
│  └──────────┘  └──────────┘                              │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS (JSON)
                         │ 统一格式: { success, data, error, pagination }
┌────────────────────────┴─────────────────────────────────┐
│                      服务端                                │
│                                                          │
│  PHP 8.2 + Nginx + PHP-FPM                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Router   │→ │Middleware│→ │Controller│→ │ Service  │ │
│  │ (入口)   │  │(认证CORS)│  │ (HTTP)   │  │(业务逻辑)│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                  ↓       │
│                                            ┌──────────┐  │
│                                            │Repository│  │
│                                            │(数据访问) │  │
│                                            └──────────┘  │
│                                                  ↓       │
│                                            ┌──────────┐  │
│                                            │PostgreSQL│  │
│                                            │  (主库)  │  │
│                                            └──────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 三、前端新架构

### 3.1 目录结构

```
src/
├── main.tsx                          # 入口文件
├── App.tsx                           # 根组件 + 路由
├── index.css                         # 全局样式
│
├── api/                              # ★ 统一API层（替代7个文件）
│   ├── client.ts                     #   Axios实例 + 拦截器
│   ├── auth.api.ts                   #   认证相关API
│   ├── account.api.ts                #   账户相关API
│   ├── transaction.api.ts            #   交易相关API
│   ├── project.api.ts                #   项目相关API
│   ├── dashboard.api.ts              #   仪表盘API
│   ├── config.api.ts                 #   配置管理API
│   └── index.ts                      #   Barrel export
│
├── contexts/                         # ★ 精简为2个Context
│   ├── AuthContext.tsx                #   认证 + 项目管理（合并ProjectContext）
│   └── LanguageContext.tsx            #   多语言
│
├── hooks/                            # ★ 自定义Hooks
│   ├── useAuth.ts                    #   认证hook
│   ├── useApi.ts                     #   API请求hook
│   ├── useProject.ts                 #   项目管理hook
│   └── useMobile.ts                  #   移动端检测
│
├── pages/                            # ★ 精简为20个页面（删除18个重复版本）
│   ├── Login.tsx                     #   登录（唯一版本）
│   ├── Dashboard.tsx                 #   仪表盘（唯一版本）
│   ├── AccountManagement.tsx         #   账户管理
│   ├── ExternalTransactions.tsx      #   外部交易
│   ├── InternalTransactions.tsx      #   内部交易
│   ├── AssetRecords.tsx              #   资产记录（唯一版本）
│   ├── NotFound.tsx                  #   404页面
│   │
│   ├── workflows/                    #   工作流模块
│   │   ├── MyApplications.tsx
│   │   ├── PendingApprovals.tsx
│   │   ├── PendingAccounting.tsx
│   │   └── PendingExecution.tsx
│   │
│   ├── personnel/                    #   人员管理模块
│   │   ├── UserManagement.tsx
│   │   ├── PermissionManagement.tsx
│   │   └── ActivityLogs.tsx
│   │
│   └── configurations/              #   配置管理模块
│       ├── AccountCategories.tsx
│       ├── AssetCategories.tsx
│       ├── SubjectCategories.tsx
│       ├── TransactionTypes.tsx
│       └── DepartmentManagement.tsx
│
├── components/                       # 组件库
│   ├── ui/                           #   shadcn/ui 基础组件（保持不变）
│   ├── layout/                       #   布局组件
│   │   ├── AppRoutes.tsx
│   │   ├── Sidebar.tsx               #   侧边栏（合并New版本）
│   │   ├── Header.tsx                #   头部（合并New版本）
│   │   └── PageLayout.tsx
│   ├── accounts/                     #   账户子组件
│   ├── dashboard/                    #   仪表盘子组件
│   ├── applications/                 #   申请子组件
│   ├── permissions/                  #   权限子组件
│   └── common/                       #   公共组件
│       ├── ProtectedRoute.tsx
│       ├── ProjectSwitcher.tsx
│       └── LanguageSwitcher.tsx
│
├── lib/                              # 工具库
│   ├── utils.ts                      #   通用工具
│   ├── storage.ts                    #   ★ localStorage统一访问
│   ├── env.ts                        #   ★ 环境配置（替代replit-fix等）
│   └── formatter.ts                  #   格式化工具
│
├── types/                            # TypeScript类型
│   ├── auth.ts
│   ├── account.ts
│   ├── transaction.ts
│   ├── project.ts
│   └── common.ts
│
├── locales/                          # 多语言
│   ├── zh.json
│   └── en.json
│
└── i18n.ts                           # i18n配置
```

### 3.2 要删除的文件（40+个）

```
★ 重复的API配置（删除6个，保留1个）
  ✗ src/utils/api-config.ts
  ✗ src/utils/axios-config.ts
  ✗ src/utils/axios-config-fixed.ts
  ✗ src/utils/config-api.ts
  ✗ src/utils/config-api-fix.ts
  ✗ src/utils/config-api-fixed.ts

★ 重复的页面组件（删除17个）
  ✗ src/pages/Dashboard-updated.tsx
  ✗ src/pages/DashboardTest.tsx
  ✗ src/pages/dashboard-new/DashboardV2.tsx
  ✗ src/pages/dashboard-new/NewDashboard.tsx
  ✗ src/pages/AssetRecords.new.tsx
  ✗ src/pages/AssetTest.tsx
  ✗ src/pages/DirectAssets.tsx
  ✗ src/pages/SimpleAssetRecord.tsx
  ✗ src/pages/RealDatabaseAssets.tsx
  ✗ src/pages/RealUserManagement.tsx
  ✗ src/pages/emergency-login.tsx
  ✗ src/pages/ApiTest.tsx
  ✗ src/pages/ApiDirectTest.jsx
  ✗ src/pages/ConnectionTest.tsx
  ✗ src/bypass-login.tsx
  ✗ src/direct-login.tsx
  ✗ src/direct-login.js

★ 重复的Context和修复文件（删除6个）
  ✗ src/contexts/api-fix.ts
  ✗ src/contexts/api-fix.tsx
  ✗ src/contexts/api-fix.js
  ✗ src/contexts/api-fix-context.tsx
  ✗ src/contexts/AuthContext.tsx.bak
  ✗ src/contexts/ProjectContext.tsx      → 合并到AuthContext

★ 废弃的工具文件（删除8个）
  ✗ src/utils/replit-fix.ts
  ✗ src/utils/api-router.js
  ✗ src/utils/direct-api.js
  ✗ src/utils/project-recovery.js
  ✗ src/api-config.js
  ✗ src/api-config-fix.js
  ✗ src/api/guest-handler.js
  ✗ src/setupProxy.js

★ 备份文件（删除3个）
  ✗ src/App.tsx.fixed
  ✗ src/pages/Dashboard.tsx.bak
  ✗ src/components/configurations/FeatureSyncManager.tsx.backup
  ✗ src/pages/configurations/FeatureSync.tsx.backup

★ 废弃的测试组件（删除2个）
  ✗ src/components/ApiTester.jsx
  ✗ src/components/DevTools.tsx
```

### 3.3 统一API层设计

```typescript
// ===== src/api/client.ts =====

import axios from 'axios';
import { storage } from '../lib/storage';

// 创建唯一的axios实例
const client = axios.create({
  baseURL: '/api',           // 始终使用相对路径
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// 请求拦截器：自动注入token和projectId
client.interceptors.request.use(config => {
  const token = storage.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const projectId = storage.getProjectId();
  if (projectId) {
    if (config.method === 'get') {
      config.params = { ...config.params, projectId };
    } else {
      config.data = { ...config.data, projectId };
    }
  }
  return config;
});

// 响应拦截器：统一错误处理
client.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      storage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default client;
```

```typescript
// ===== src/api/auth.api.ts =====

import client from './client';
import type { User, LoginResponse } from '../types/auth';

export const authApi = {
  login: (username: string, password: string) =>
    client.post<LoginResponse>('/login', { username, password }),

  logout: () => client.post('/logout'),

  getCurrentUser: () => client.get<User>('/user'),

  switchProject: (projectId: number) =>
    client.post('/switch-project', { projectId }),
};
```

```typescript
// ===== src/api/index.ts =====
// Barrel export - 所有API的唯一入口

export { authApi } from './auth.api';
export { accountApi } from './account.api';
export { transactionApi } from './transaction.api';
export { projectApi } from './project.api';
export { dashboardApi } from './dashboard.api';
export { configApi } from './config.api';
export { default as client } from './client';
```

### 3.4 统一Context设计

```typescript
// ===== src/contexts/AuthContext.tsx =====
// 合并了原来的 AuthContext + ProjectContext

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  currentProject: Project | null;
  projects: Project[];
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchProject: (projectId: number) => Promise<boolean>;
}
```

### 3.5 统一localStorage访问

```typescript
// ===== src/lib/storage.ts =====

const KEYS = {
  TOKEN: 'oa_token',
  USER: 'oa_user',
  PROJECT: 'oa_current_project',
  LANG: 'oa_language',
} as const;

export const storage = {
  getToken: (): string | null => localStorage.getItem(KEYS.TOKEN),
  setToken: (token: string) => localStorage.setItem(KEYS.TOKEN, token),

  getUser: (): User | null => {
    const raw = localStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: User) => localStorage.setItem(KEYS.USER, JSON.stringify(user)),

  getProjectId: (): number | null => {
    const raw = localStorage.getItem(KEYS.PROJECT);
    if (!raw) return null;
    const project = JSON.parse(raw);
    return project?.id || null;
  },
  setProject: (project: Project) =>
    localStorage.setItem(KEYS.PROJECT, JSON.stringify(project)),

  clear: () => {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
  },
};
```

### 3.6 Provider嵌套（简化）

```
当前（7层）:
  BrowserRouter → LanguageProvider → ApiFixProvider → AuthProvider
    → ProjectProvider → QueryClientProvider → TooltipProvider

新设计（4层）:
  BrowserRouter → LanguageProvider → AuthProvider → TooltipProvider

删除：ApiFixProvider、ProjectProvider（合并到Auth）、QueryClientProvider（暂不需要）
```

---

## 四、后端新架构

### 4.1 目录结构

```
api/
├── index.php                         # 入口：路由分发
│
├── config/
│   ├── .env                          # ★ 环境变量（git忽略）
│   ├── .env.example                  # 环境变量模板
│   ├── app.php                       # ★ 应用配置（读取.env）
│   └── database.php                  # 数据库连接
│
├── middleware/                        # ★ 新增：中间件
│   ├── CorsMiddleware.php            #   CORS处理
│   ├── AuthMiddleware.php            #   JWT认证验证
│   └── JsonMiddleware.php            #   JSON请求/响应处理
│
├── controllers/                      # 控制器（仅HTTP处理，<150行）
│   ├── AuthController.php
│   ├── AccountController.php
│   ├── TransactionController.php
│   ├── ProjectController.php
│   ├── DashboardController.php
│   └── ConfigController.php
│
├── services/                         # ★ 新增：业务逻辑层
│   ├── AuthService.php               #   登录、注册、JWT生成/验证
│   ├── AccountService.php            #   账户CRUD、余额计算
│   ├── TransactionService.php        #   交易CRUD、账户余额联动
│   ├── ProjectService.php            #   项目管理、用户关联
│   ├── DashboardService.php          #   统计聚合
│   └── ConfigService.php             #   配置项管理
│
├── repositories/                     # ★ 新增：数据访问层
│   ├── BaseRepository.php            #   公共CRUD方法
│   ├── UserRepository.php
│   ├── AccountRepository.php
│   ├── TransactionRepository.php
│   ├── ProjectRepository.php
│   └── ConfigRepository.php
│
├── models/                           # 数据模型（纯数据映射）
│   ├── User.php
│   ├── Account.php
│   ├── Transaction.php
│   └── Project.php
│
├── utils/                            # 工具
│   ├── Response.php                  # ★ 统一响应格式
│   ├── Validator.php                 # ★ 请求验证
│   └── Logger.php                    # ★ 日志记录
│
└── migrations/                       # ★ 新增：数据库迁移
    ├── 001_create_users.sql
    ├── 002_create_projects.sql
    ├── 003_create_accounts.sql
    ├── 004_create_transactions.sql
    ├── 005_create_configs.sql
    └── seed.sql                      # 初始数据
```

### 4.2 要删除的文件（10个）

```
★ 独立脚本（整合到Controller/Service）
  ✗ api/assets.php              → 整合到 ConfigController
  ✗ api/users.php               → 整合到 AuthController
  ✗ api/users.js                → 删除（过时的Node.js代理）
  ✗ api/currency-types.php      → 整合到 ConfigController
  ✗ api/dashboard-real-data.php → 整合到 DashboardController
  ✗ api/init_test_users.php     → 整合到 migrations/seed.sql
  ✗ api/db_init.php             → 拆分到 migrations/*.sql

★ 旧配置文件
  ✗ api/config/config.php       → 替换为 api/config/app.php
  ✗ api/test/login.php          → 删除（临时测试文件）
  ✗ api/test/login_debug.log    → 删除
```

### 4.3 请求处理流程

```
HTTP请求
  ↓
index.php（路由分发）
  ↓
Middleware Pipeline:
  1. CorsMiddleware    → 设置CORS头，处理OPTIONS
  2. JsonMiddleware    → 解析JSON请求体，设置Content-Type
  3. AuthMiddleware    → 验证JWT，注入$currentUser（公开路由跳过）
  ↓
Controller（HTTP处理）
  - 提取请求参数
  - 调用Service方法
  - 返回Response
  ↓
Service（业务逻辑）
  - 数据验证
  - 业务规则
  - 事务管理
  ↓
Repository（数据访问）
  - SQL查询
  - PDO操作
  ↓
Response（统一格式）
  → { success: true, data: {...}, pagination?: {...} }
  → { success: false, error: { code: "...", message: "..." } }
```

### 4.4 统一响应格式

```php
// ===== api/utils/Response.php =====

class Response {

    // 成功响应
    public static function success($data = null, string $message = 'OK', int $status = 200): void {
        http_response_code($status);
        echo json_encode([
            'success' => true,
            'message' => $message,
            'data' => $data
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 分页响应
    public static function paginated(array $items, int $total, int $page, int $limit): void {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'data' => $items,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 错误响应
    public static function error(string $message, string $code = 'ERROR', int $status = 400): void {
        http_response_code($status);
        echo json_encode([
            'success' => false,
            'error' => [
                'code' => $code,
                'message' => $message
            ]
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
```

### 4.5 路由设计

```php
// ===== api/index.php =====

// 公开路由（无需认证）
$publicRoutes = [
    'POST /login'    => [AuthController::class, 'login'],
    'POST /register' => [AuthController::class, 'register'],
    'GET  /health'   => [AuthController::class, 'health'],
];

// 受保护路由（需要JWT）
$protectedRoutes = [
    // 认证
    'POST /logout'           => [AuthController::class, 'logout'],
    'GET  /user'             => [AuthController::class, 'getUser'],
    'POST /switch-project'   => [AuthController::class, 'switchProject'],

    // 项目
    'GET    /projects'       => [ProjectController::class, 'index'],
    'POST   /projects'       => [ProjectController::class, 'create'],
    'GET    /projects/{id}'  => [ProjectController::class, 'show'],
    'PUT    /projects/{id}'  => [ProjectController::class, 'update'],
    'DELETE /projects/{id}'  => [ProjectController::class, 'destroy'],

    // 账户
    'GET    /accounts'       => [AccountController::class, 'index'],
    'POST   /accounts'       => [AccountController::class, 'create'],
    'GET    /accounts/{id}'  => [AccountController::class, 'show'],
    'PUT    /accounts/{id}'  => [AccountController::class, 'update'],

    // 账户类型
    'GET    /account-types'       => [ConfigController::class, 'accountTypes'],
    'POST   /account-types'       => [ConfigController::class, 'createAccountType'],
    'PUT    /account-types/{id}'  => [ConfigController::class, 'updateAccountType'],
    'DELETE /account-types/{id}'  => [ConfigController::class, 'deleteAccountType'],

    // 交易
    'GET    /transactions'          => [TransactionController::class, 'index'],
    'POST   /transactions'          => [TransactionController::class, 'create'],
    'GET    /transactions/{id}'     => [TransactionController::class, 'show'],
    'PUT    /transactions/{id}'     => [TransactionController::class, 'update'],
    'GET    /transaction-summary'   => [TransactionController::class, 'summary'],

    // 仪表盘
    'GET /dashboard/account-summary'       => [DashboardController::class, 'accountSummary'],
    'GET /dashboard/transaction-summary'   => [DashboardController::class, 'transactionSummary'],
    'GET /dashboard/income-by-subject'     => [DashboardController::class, 'incomeBySubject'],
    'GET /dashboard/expense-by-subject'    => [DashboardController::class, 'expenseBySubject'],
    'GET /dashboard/expense-by-department' => [DashboardController::class, 'expenseByDepartment'],
    'GET /dashboard/time-series'           => [DashboardController::class, 'timeSeries'],

    // 配置
    'GET    /currency-types'       => [ConfigController::class, 'currencyTypes'],
    'POST   /currency-types'       => [ConfigController::class, 'createCurrencyType'],
    'GET    /asset-types'          => [ConfigController::class, 'assetTypes'],
    'GET    /subjects'             => [ConfigController::class, 'subjects'],
    'GET    /departments'          => [ConfigController::class, 'departments'],
];
```

### 4.6 Controller示例（精简版）

```php
// ===== api/controllers/AccountController.php =====

class AccountController {
    private AccountService $service;

    public function __construct(PDO $db, ?array $currentUser) {
        $this->service = new AccountService($db);
    }

    // GET /accounts
    public function index(): void {
        $projectId = $_GET['projectId'] ?? null;
        if (!$projectId) Response::error('缺少项目ID', 'MISSING_PROJECT_ID');

        $page = (int)($_GET['page'] ?? 1);
        $limit = (int)($_GET['limit'] ?? 50);

        $result = $this->service->getAccounts($projectId, $page, $limit);
        Response::paginated($result['items'], $result['total'], $page, $limit);
    }

    // POST /accounts
    public function create(): void {
        $data = json_decode(file_get_contents('php://input'), true);
        $account = $this->service->createAccount($data);
        Response::success($account, '创建成功', 201);
    }

    // GET /accounts/{id}
    public function show(int $id): void {
        $account = $this->service->getAccount($id);
        if (!$account) Response::error('账户不存在', 'NOT_FOUND', 404);
        Response::success($account);
    }

    // PUT /accounts/{id}
    public function update(int $id): void {
        $data = json_decode(file_get_contents('php://input'), true);
        $account = $this->service->updateAccount($id, $data);
        Response::success($account, '更新成功');
    }
}
```

### 4.7 Service示例

```php
// ===== api/services/AccountService.php =====

class AccountService {
    private AccountRepository $repo;

    public function __construct(PDO $db) {
        $this->repo = new AccountRepository($db);
    }

    public function getAccounts(int $projectId, int $page, int $limit): array {
        return [
            'items' => $this->repo->findByProject($projectId, $page, $limit),
            'total' => $this->repo->countByProject($projectId)
        ];
    }

    public function createAccount(array $data): array {
        // 业务验证
        if (empty($data['name'])) throw new \InvalidArgumentException('账户名称不能为空');
        if (empty($data['account_type'])) throw new \InvalidArgumentException('账户类型不能为空');

        return $this->repo->create($data);
    }

    public function updateAccount(int $id, array $data): array {
        $existing = $this->repo->findById($id);
        if (!$existing) throw new \RuntimeException('账户不存在');
        return $this->repo->update($id, $data);
    }
}
```

### 4.8 Repository示例

```php
// ===== api/repositories/BaseRepository.php =====

abstract class BaseRepository {
    protected PDO $db;
    protected string $table;

    public function __construct(PDO $db) {
        $this->db = $db;
    }

    public function findById(int $id): ?array {
        $stmt = $this->db->prepare("SELECT * FROM {$this->table} WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function create(array $data): array {
        $columns = implode(', ', array_keys($data));
        $placeholders = implode(', ', array_fill(0, count($data), '?'));
        $stmt = $this->db->prepare("INSERT INTO {$this->table} ($columns) VALUES ($placeholders) RETURNING *");
        $stmt->execute(array_values($data));
        return $stmt->fetch();
    }

    public function update(int $id, array $data): array {
        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
        $stmt = $this->db->prepare("UPDATE {$this->table} SET $sets, updated_at = NOW() WHERE id = ? RETURNING *");
        $stmt->execute([...array_values($data), $id]);
        return $stmt->fetch();
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM {$this->table} WHERE id = ?");
        return $stmt->execute([$id]);
    }
}
```

---

## 五、数据库规划

### 5.1 统一使用 PostgreSQL

删除 MySQL 支持（简化维护），仅保留 PostgreSQL 16。

### 5.2 表结构（保持现有设计，无需改动）

现有的12张表设计基本合理：

```
核心表：
├── users              用户
├── projects           项目
├── user_projects      用户-项目关联（多对多）
├── super_admins       超级管理员
├── super_admin_projects 超管-项目关联
│
业务表：
├── accounts           账户
├── transactions       交易记录
├── departments        部门
│
配置表：
├── account_types      账户类型
├── currency_types     币种
├── subjects           科目
│
日志表：
├── activity_logs      活动日志
└── sessions           会话
```

### 5.3 数据库迁移（新增）

```
api/migrations/
├── 001_create_users.sql
├── 002_create_projects.sql
├── 003_create_user_projects.sql
├── 004_create_super_admins.sql
├── 005_create_departments.sql
├── 006_create_currency_types.sql
├── 007_create_account_types.sql
├── 008_create_accounts.sql
├── 009_create_subjects.sql
├── 010_create_transactions.sql
├── 011_create_activity_logs.sql
├── 012_create_sessions.sql
└── seed.sql                        # 初始数据（用户、默认配置）
```

---

## 六、前后端通信约定

### 6.1 统一API规范

```
基础URL：     /api
认证方式：     Bearer Token (JWT)
请求格式：     JSON (Content-Type: application/json)
响应格式：     JSON (统一结构)
字段命名：     snake_case（前端在API层自动转换为camelCase）
日期格式：     ISO 8601 (YYYY-MM-DD HH:MM:SS)
分页参数：     ?page=1&limit=20
项目参数：     ?projectId=1（GET）或 body中 projectId（POST）
```

### 6.2 统一响应格式

```json
// 成功（单条数据）
{
  "success": true,
  "message": "获取成功",
  "data": { "id": 1, "name": "..." }
}

// 成功（列表+分页）
{
  "success": true,
  "data": [{ ... }, { ... }],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}

// 失败
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "账户名称不能为空"
  }
}
```

### 6.3 HTTP状态码约定

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | 成功 | GET、PUT、DELETE成功 |
| 201 | 创建成功 | POST创建资源成功 |
| 400 | 请求错误 | 参数缺失、验证失败 |
| 401 | 未认证 | Token无效或过期 |
| 403 | 无权限 | 无项目访问权限 |
| 404 | 不存在 | 资源不存在 |
| 500 | 服务器错误 | 内部错误 |

---

## 七、Docker 部署架构

### 7.1 简化后的docker-compose.yml

```yaml
services:
  # 唯一数据库：PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: oa_system
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./api/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]

  # Redis 缓存
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  # 主应用
  app:
    build: .
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: oa_system
      DB_USER: postgres
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      REDIS_HOST: redis
      JWT_SECRET: ${JWT_SECRET:-change_me_in_production}
    ports:
      - "8000:80"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
```

**变更**：
- ✅ 删除 MySQL（简化为仅 PostgreSQL）
- ✅ 删除 Adminer（生产环境不需要）
- ✅ 使用环境变量（不再硬编码）

---

## 八、文件数量对比

| 类别 | 现有 | 重构后 | 减少 |
|------|------|--------|------|
| 前端API文件 | 7 | 1（+6个模块） | -1 |
| 前端页面 | 38 | 20 | -18 |
| 前端Context | 4+6修复 | 2 | -8 |
| 前端工具 | 15+ | 4 | -11 |
| 后端控制器 | 6（500行均） | 6（150行均） | 行数-70% |
| 后端Service | 0 | 6 | +6 |
| 后端Repository | 0 | 6 | +6 |
| 后端独立脚本 | 8 | 0 | -8 |
| 数据库迁移 | 0 | 13 | +13 |
| **总文件数** | **~220** | **~120** | **-45%** |

---

## 九、执行计划

### 阶段一：清理（3天）
1. 删除所有重复/废弃文件（40+个）
2. 备份到 archive 分支
3. 验证应用仍可运行

### 阶段二：前端重构（5天）
1. 创建统一API层 `src/api/`
2. 创建统一storage `src/lib/storage.ts`
3. 合并AuthContext + ProjectContext
4. 更新所有页面的import路径
5. 重新编译验证

### 阶段三：后端重构（5天）
1. 创建Middleware层
2. 创建Service层
3. 创建Repository层
4. 重构Controller（精简到<150行）
5. 统一Response格式
6. 创建数据库迁移文件

### 阶段四：集成测试（2天）
1. 前后端联调
2. 所有API端点测试
3. 登录→仪表盘→各功能模块完整流程测试
4. Docker部署验证

**总预估：15个工作日**

---

## 十、关键原则

1. **单一职责** - 每个文件只做一件事
2. **统一入口** - API、Storage、Response 都通过单一入口
3. **分层清晰** - Controller → Service → Repository，不允许跨层调用
4. **配置外部化** - 所有配置通过 .env 文件
5. **向后兼容** - 保持API端点不变，前端无需改URL
6. **渐进式迁移** - 每次只改一个模块，确保其他模块不受影响
