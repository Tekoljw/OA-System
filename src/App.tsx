import React, { useEffect } from "react";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { SidebarProvider } from "./components/layout/NewSidebar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
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

// 创建受保护的侧边栏包装器
const ProtectedSidebarPage = withProtectedRoute(({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>
    {children}
  </SidebarProvider>
));

const App = () => {
  console.log("App组件重新渲染");
  
  return (
    <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ApiErrorHandler>
              <Toaster />
              <Sonner />
              <Routes>
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
                  <ProtectedSidebarPage>
                    <AccountManagement />
                  </ProtectedSidebarPage>
                } />
                
                {/* 股东管理 */}
                <Route path="/shareholders" element={
                  <ProtectedSidebarPage>
                    <ShareholderManagement />
                  </ProtectedSidebarPage>
                } />

                {/* 交易管理 */}
                <Route path="/transactions/external" element={
                  <ProtectedSidebarPage>
                    <ExternalTransactions />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/transactions/internal" element={
                  <ProtectedSidebarPage>
                    <InternalTransactions />
                  </ProtectedSidebarPage>
                } />
                
                {/* 资产管理 */}
                <Route path="/assets/records" element={
                  <ProtectedSidebarPage>
                    <AssetRecords />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/assets/loans" element={
                  <ProtectedSidebarPage>
                    <LoanRecords />
                  </ProtectedSidebarPage>
                } />
                
                {/* 工作流管理 */}
                <Route path="/workflows/my-applications" element={
                  <ProtectedSidebarPage>
                    <MyApplications />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/workflows/pending-approvals" element={
                  <ProtectedSidebarPage>
                    <PendingApprovals />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/workflows/pending-accounting" element={
                  <ProtectedSidebarPage>
                    <PendingAccounting />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/workflows/pending-execution" element={
                  <ProtectedSidebarPage>
                    <PendingExecution />
                  </ProtectedSidebarPage>
                } />
                
                {/* 人员管理 */}
                <Route path="/personnel/user-management" element={
                  <ProtectedSidebarPage>
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
                <Route path="/configurations/account-categories" element={
                  <ProtectedSidebarPage>
                    <AccountCategories />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/configurations/asset-categories" element={
                  <ProtectedSidebarPage>
                    <AssetCategories />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/configurations/subject-categories" element={
                  <ProtectedSidebarPage>
                    <SubjectCategories />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/configurations/transaction-types" element={
                  <ProtectedSidebarPage>
                    <TransactionTypes />
                  </ProtectedSidebarPage>
                } />

                <Route path="/configurations/approval-rules" element={
                  <ProtectedSidebarPage>
                    <ApprovalRules />
                  </ProtectedSidebarPage>
                } />
                
                {/* 部门管理 */}
                <Route path="/configurations/departments" element={
                  <ProtectedSidebarPage>
                    <DepartmentManagement />
                  </ProtectedSidebarPage>
                } />
                
                {/* Feature sync removed as all projects now automatically share functionality */}
                
                {/* 人员管理 */}
                <Route path="/personnel/departments" element={
                  <ProtectedSidebarPage>
                    <DepartmentManagement />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/personnel/permissions" element={
                  <ProtectedSidebarPage>
                    <PermissionManagement />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/personnel/users" element={
                  <ProtectedSidebarPage>
                    <UserManagement />
                  </ProtectedSidebarPage>
                } />
                
                <Route path="/personnel/activity-logs" element={
                  <ProtectedSidebarPage>
                    <ActivityLogs />
                  </ProtectedSidebarPage>
                } />
                
                {/* 404页面 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ApiErrorHandler>
          </TooltipProvider>
        </QueryClientProvider>
    </AuthProvider>
  );
};

export default App;