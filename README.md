# OA System - 智能办公系统

A modern financial management and office automation system built with React, TypeScript, and PHP.

**系统特性：**
- 💰 财务管理系统（收支、账户、资产）
- 🏢 办公自动化（工作流、审批流程）
- 👥 人员管理（用户、角色、权限）
- 📊 数据分析（仪表板、统计图表）
- 🌍 多语言支持（中文、英文）
- 📱 响应式设计（桌面、平板、手机）

## 技术栈

### Frontend
- **React 18** + **Vite** - 现代前端框架
- **TypeScript** - 类型安全
- **TailwindCSS** - 样式框架
- **Shadcn/ui** - UI 组件库
- **Axios** - HTTP 客户端
- **i18next** - 多语言支持

### Backend
- **PHP 8.2** - 服务器语言
- **PDO** - 数据库抽象层
- **Nginx** - 反向代理
- **PHP-FPM** - 应用服务器

### Infrastructure
- **Docker & Docker Compose** - 容器化部署
- **PostgreSQL 16** - 主数据库
- **MySQL 8.0** - 备用数据库
- **Redis 7** - 缓存层
- **Let's Encrypt** - SSL 证书

## 快速开始

### 本地开发

```bash
# 1. 进入项目目录
cd /home/ubuntu/OA-System

# 2. 启动 Docker 容器
docker-compose up -d

# 3. 访问应用
# 前端: http://localhost:8000
# 管理: http://localhost:8888 (Adminer)

# 4. 登录凭证
# 用户名: phpuser
# 密码: 123456
```

### Docker 部署

```bash
# 构建镜像
docker-compose build

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f oa-system

# 停止服务
docker-compose down
```

## 项目结构

```
OA-System/
├── api/                      # PHP 后端
│   ├── controllers/          # 业务逻辑控制器 (6个)
│   │   ├── auth_controller.php
│   │   ├── accounts_controller.php
│   │   ├── transactions_controller.php
│   │   ├── projects_controller.php
│   │   ├── dashboard_controller.php
│   │   └── config_controller.php
│   ├── models/               # 数据模型
│   ├── config/               # 数据库配置
│   ├── utils/                # 工具函数
│   └── test/                 # 测试数据和接口
│
├── src/                      # React 前端源代码
│   ├── pages/                # 页面组件 (38个)
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── AccountManagement.tsx
│   │   ├── AssetRecords.tsx
│   │   ├── configurations/   # 配置页面
│   │   ├── personnel/        # 人员管理页面
│   │   └── workflows/        # 工作流页面
│   ├── components/           # UI 组件库
│   │   ├── ui/              # Shadcn 组件
│   │   ├── layout/          # 布局组件
│   │   ├── accounts/        # 账户相关
│   │   ├── dashboard/       # 仪表板组件
│   │   └── ...
│   ├── contexts/             # React Context
│   ├── utils/                # 前端工具函数
│   ├── locales/              # 多语言配置
│   └── main.tsx              # 应用入口
│
├── public/dist/              # 编译后的前端文件
│   ├── assets/               # 静态资源
│   ├── index.html            # HTML 入口
│   └── ...
│
├── docker-compose.yml        # Docker 编排配置
├── Dockerfile                # Docker 镜像定义
├── .env.example              # 环境变量示例
└── README.md                 # 本文件
```

## 核心功能模块

### 1. 财务管理 💰
- 账户管理（银行账户、现金账户等）
- 收支记录（收入、支出、转账）
- 资产跟踪（固定资产、流动资产）
- 财务报表和分析

### 2. 人员管理 👥
- 用户管理（创建、编辑、删除）
- 角色权限（5个预设角色）
- 部门管理
- 活动日志

### 3. 配置管理 ⚙️
- 账户类型（银行、现金等）
- 资产类型（固定资产、流动资产等）
- 交易类型（收入、支出等）
- 货币类型（CNY、USD 等）
- 科目分类

### 4. 工作流 📋
- 我的申请
- 待批准事项
- 待执行任务
- 待核算项目

## API 文档

### 认证接口
```
POST /api/test/login
POST /api/logout
POST /api/register
```

### 账户接口
```
GET /api/accounts
GET /api/accounts/:id
POST /api/accounts
PUT /api/accounts/:id
DELETE /api/accounts/:id
```

### 交易接口
```
GET /api/transactions
POST /api/transactions
GET /api/transaction-summary
```

### 仪表板接口
```
GET /api/dashboard/account-summary
GET /api/dashboard/income-by-subject
GET /api/dashboard/expense-by-department
GET /api/dashboard/time-series
```

## 环境变量配置

复制 `.env.example` 为 `.env`，然后修改对应的配置：

```bash
cp .env.example .env
```

## 常用命令

```bash
# 启动开发服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 进入容器
docker-compose exec oa-system bash

# 重启服务
docker-compose restart

# 停止并删除容器
docker-compose down
```

## 故障排除

### 页面空白
1. 清空浏览器缓存 (Ctrl+Shift+Delete)
2. 硬刷新页面 (Ctrl+Shift+R 或 Cmd+Shift+R)
3. 检查浏览器控制台 (F12) 查看错误

### 无法登录
1. 确保 Docker 容器正在运行: `docker-compose ps`
2. 检查 API 连接: `curl http://localhost:8000/api/`
3. 查看服务日志: `docker-compose logs oa-system`

### 数据库连接失败
1. 检查数据库容器状态: `docker-compose ps`
2. 验证环境变量配置
3. 重启数据库服务: `docker-compose restart postgres mysql`

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 许可证

MIT License - 详见 LICENSE 文件

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

---

**最后更新**: 2026-08-26
**版本**: 1.0.0
