import React from 'react';
import { Route, Switch, useLocation } from 'react-router-dom';
import Dashboard from '../../pages/dashboard/Dashboard';
import NewDashboard from '../../pages/dashboard-new/NewDashboard'; // 导入新仪表盘
import Accounts from '../../pages/accounts/Accounts';
import Assets from '../../pages/assets/Assets';
import Loans from '../../pages/loans/Loans';
import Applications from '../../pages/applications/Applications';
import Transfers from '../../pages/transfers/Transfers';
import Departments from '../../pages/departments/Departments';
import Configurations from '../../pages/configurations/Configurations';
import Reports from '../../pages/reports/Reports';
import NotFound from '../../pages/NotFound';
import ActivityLogs from '../../pages/activity-logs/ActivityLogs';
import UserManagement from '../../pages/users/UserManagement';
import Permissions from '../../pages/permissions/Permissions';
import ProjectManagement from '../../pages/projects/ProjectManagement';

const AppRoutes: React.FC = () => {
  const location = useLocation();
  
  return (
    <Switch location={location}>
      <Route exact path="/" component={NewDashboard} /> {/* 使用新仪表盘作为默认首页 */}
      <Route path="/dashboard/classic" component={Dashboard} /> {/* 保留旧仪表盘，但改变路径 */}
      <Route path="/accounts" component={Accounts} />
      <Route path="/assets" component={Assets} />
      <Route path="/loans" component={Loans} />
      <Route path="/applications" component={Applications} />
      <Route path="/transfers" component={Transfers} />
      <Route path="/departments" component={Departments} />
      <Route path="/configurations" component={Configurations} />
      <Route path="/reports" component={Reports} />
      <Route path="/logs" component={ActivityLogs} />
      <Route path="/users" component={UserManagement} />
      <Route path="/permissions" component={Permissions} />
      <Route path="/projects" component={ProjectManagement} />
      <Route component={NotFound} />
    </Switch>
  );
};

export default AppRoutes;