import React, { useEffect } from "react";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { SidebarProvider } from "./components/layout/NewSidebar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { BaseCurrencyProvider } from "./contexts/BaseCurrencyContext";
import { usePermissions } from "./hooks/use-permissions";
import type { PermissionKey } from "./types/permission";
import { ShieldAlert } from "lucide-react";
import PageLayout from "./components/layout/PageLayout";
import ApiErrorHandler from "./components/common/ApiErrorHandler";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AccountManagement from "./pages/AccountManagement";
import Dashboard from "./pages/Dashboard";
import ExternalTransactions from "./pages/ExternalTransactions";
import InternalTransactions from "./pages/InternalTransactions";
import AssetRecords from "./pages/AssetRecords";
import LoanRecords from "./pages/AssetRecords/LoanRecords";
import MyApplications from "./pages/Workflows/MyApplications";
import PendingApprovals from "./pages/Workflows/PendingApprovals";
import PendingAccounting from "./pages/Workflows/PendingAccounting";
import PendingExecution from "./pages/Workflows/PendingExecution";
import AccountCategories from "./pages/configurations/AccountCategories";
import AssetCategories from "./pages/configurations/AssetCategories";
import SubjectCategories from "./pages/configurations/SubjectCategories";
import TransactionTypes from "./pages/configurations/TransactionTypes";
import ApprovalRules from "./pages/configurations/ApprovalRules";
import DepartmentManagement from "./pages/configurations/DepartmentManagement";
import PermissionManagement from "./pages/personnel/PermissionManagement";
import ActivityLogs from "./pages/personnel/ActivityLogs";
import UserManagement from "./pages/personnel/UserManagement";
import ShareholderManagement from "./pages/ShareholderManagement";
import Login from "./pages/Login";

const queryClient = new QueryClient();

// 创建受保护的路由高阶组件
// 这种写法解决了ViteJS热更新的问题，确保useAuth在AuthProvider内部使用
const withProtectedRoute = (Component: React.ComponentType<any>) => {
  // 返回一个包装组件，这个组件已经通过了身份验证检查
  return function ProtectedRouteWrapper(props: any) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoggedIn, isLoading } = useAuth();
    
    useEffect(() => {
      // 只有在加载完成后再判断登录状态，避免闪烁
      if (!isLoading && !isLoggedIn && location.pathname !== "/login") {
        console.log('未登录，重定向到登录页面');
        navigate("/login");
      }
    }, [isLoggedIn, isLoading, navigate, location]);
  
    // 如果正在加载，显示加载状态
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          <span className="ml-2">加载中...</span>
        </div>
      );
    }
  
    // 如果已登录，渲染传入的组件
    return isLoggedIn ? <Component {...props} /> : null;
  };
};

/**
 * 无权限时的提示页。
 * 不做静默跳转 —— 用户点了链接却被弹回首页，会以为系统坏了；
 * 明确告知无权访问，并留一个返回首页的出口。
 */
const NoPermission: React.FC<{ permission: PermissionKey | PermissionKey[] }> = ({ permission }) => (
  // 必须套在 PageLayout 里，否则侧边栏不渲染，用户被困在这一页只能点返回
  <PageLayout title="无权访问" subtitle="当前角色不具备访问该页面的权限">
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-6 text-center">
      <ShieldAlert className="h-12 w-12 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-medium">无权访问该页面</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          当前角色不具备
          「{(Array.isArray(permission) ? permission : [permission])
              .map(k => PERMISSION_TITLES[k] ?? k).join(' 或 ')}」
          权限，如需使用请联系管理员。
        </p>
      </div>
    </div>
  </PageLayout>
);

/** 权限项对应的中文名，用于提示文案 */
const PERMISSION_TITLES: Record<string, string> = {
  view_dashboard: '查看仪表盘',
  view_accounts: '查看账户',
  verify_accounts: '管理账户',
  manage_accounting: '会计操作',
  view_transactions: '查看交易',
  view_assets: '查看资产',
  manage_assets: '管理资产',
  manage_my_applications: '我的申请',
  manage_pending_approvals: '审批管理',
  manage_pending_accounting: '归帐管理',
  manage_pending_execution: '执行管理',
  manage_configurations: '配置管理',
  manage_personnel: '人员管理',
};

// 创建受保护的侧边栏包装器
// permission 可选：标注后，无该权限的用户看到提示页而非页面内容。
// 这只是显示层，服务端对每个写操作仍独立校验。
const ProtectedSidebarPage = withProtectedRoute(
  ({ children, permission }: { children: React.ReactNode; permission?: PermissionKey | PermissionKey[] }) => {
    const { can } = usePermissions();
    return (
      <SidebarProvider>
        {permission && !can(permission) ? <NoPermission permission={permission} /> : children}
      </SidebarProvider>
    );
  }
);

/**
 * 路由子树。key 绑定当前项目 id：切换项目时整棵子树重新挂载，
 * 各页面重跑数据请求，替代此前的 window.location.reload()。
 */
const AppRoutes = () => {
  const { currentProject } = useAuth();

  return (
    <ApiErrorHandler>
      <Toaster />
      <Sonner />
      <Routes key={currentProject?.id ?? 'no-project'}>
                {/* 公开路由 */}
                <Route path="/login" element={<Login />} />
                {/* 应急登录页面已移除 */}
                
                {/* 主页 */}
                <Route path="/" element={
                  <ProtectedSidebarPage>
                    <Index />
                  </ProtectedSidebarPage>
                } />
                
                {/* 仪表盘 - 使用新版本 */}
                <Route path="/dashboard" element={
                  <ProtectedSidebarPage>
                    <Dashboard />
                  </ProtectedSidebarPage>
                } />
                
                {/* 仪表盘 - 原始版本 - 暂时隐藏，可以根据需要恢复 */}
                
                {/* 账户管理 */}
                <Route path="/accounts" element={
                  <ProtectedSidebarPage permission="view_accounts">
                    <AccountManagement />
                  </ProtectedSidebarPage>
                } />
                
                {/* 股东管理 */}
                <Route path="/shareholders" element={
                  <ProtectedSidebarPage permission="manage_configurations">
                    <ShareholderManagement />
                  </ProtectedSidebarPage>
                } />

                {/* 交易管理 */}
                <Route path="/transactions/external" element={
                  <ProtectedSidebarPage permission="view_transactions">
                    <ExternalTransactions />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/transactions/internal" element={
                  <ProtectedSidebarPage permission="view_transactions">
                    <InternalTransactions />
                  </ProtectedSidebarPage>
                } />
                
                {/* 资产管理 */}
                <Route path="/assets/records" element={
                  <ProtectedSidebarPage permission="view_assets">
                    <AssetRecords />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/assets/loans" element={
                  <ProtectedSidebarPage permission="view_assets">
                    <LoanRecords />
                  </ProtectedSidebarPage>
                } />
                
                {/* 工作流管理 */}
                <Route path="/workflows/my-applications" element={
                  <ProtectedSidebarPage permission="manage_my_applications">
                    <MyApplications />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/workflows/pending-approvals" element={
                  <ProtectedSidebarPage permission="manage_pending_approvals">
                    <PendingApprovals />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/workflows/pending-accounting" element={
                  <ProtectedSidebarPage permission="manage_pending_accounting">
                    <PendingAccounting />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/workflows/pending-execution" element={
                  <ProtectedSidebarPage permission="manage_pending_execution">
                    <PendingExecution />
                  </ProtectedSidebarPage>
                } />
                
                {/* 人员管理 */}
                <Route path="/personnel/user-management" element={
                  <ProtectedSidebarPage permission="manage_personnel">
                    <UserManagement />
                  </ProtectedSidebarPage>
                } />
                
                {/* 用户管理 - 简化路径 */}
                <Route path="/users" element={
                  <ProtectedSidebarPage>
                    <UserManagement />
                  </ProtectedSidebarPage>
                } />
                
                {/* 配置管理 */}
                {/* 会计要进这页维护汇率，配置管理员要进这页改账户类型 */}
                <Route path="/configurations/account-categories" element={
                  <ProtectedSidebarPage permission={["manage_configurations", "manage_accounting"]}>
                    <AccountCategories />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/configurations/asset-categories" element={
                  <ProtectedSidebarPage permission="manage_configurations">
                    <AssetCategories />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/configurations/subject-categories" element={
                  <ProtectedSidebarPage permission="manage_configurations">
                    <SubjectCategories />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/configurations/transaction-types" element={
                  <ProtectedSidebarPage permission="manage_configurations">
                    <TransactionTypes />
                  </ProtectedSidebarPage>
                } />

                <Route path="/configurations/approval-rules" element={
                  <ProtectedSidebarPage permission="manage_configurations">
                    <ApprovalRules />
                  </ProtectedSidebarPage>
                } />
                
                {/* 部门管理 */}
                <Route path="/configurations/departments" element={
                  <ProtectedSidebarPage permission="manage_personnel">
                    <DepartmentManagement />
                  </ProtectedSidebarPage>
                } />
                
                {/* Feature sync removed as all projects now automatically share functionality */}
                
                {/* 人员管理 */}
                <Route path="/personnel/departments" element={
                  <ProtectedSidebarPage permission="manage_personnel">
                    <DepartmentManagement />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/personnel/permissions" element={
                  <ProtectedSidebarPage permission="manage_personnel">
                    <PermissionManagement />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/personnel/users" element={
                  <ProtectedSidebarPage permission="manage_personnel">
                    <UserManagement />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/personnel/activity-logs" element={
                  <ProtectedSidebarPage permission="manage_personnel">
                    <ActivityLogs />
                  </ProtectedSidebarPage>
                } />
                
      {/* 404页面 */}
      <Route path="*" element={<NotFound />} />
      </Routes>
    </ApiErrorHandler>
  );
};

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BaseCurrencyProvider>
          <AppRoutes />
        </BaseCurrencyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;