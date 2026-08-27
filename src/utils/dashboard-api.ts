/**
 * 仪表盘API专用工具函数
 * 重构版：基于统一 API 客户端
 */
import client from '../api/client';

export const fetchDashboardData = async (endpoint: string) => {
  try {
    const currentProject = localStorage.getItem('currentProject');
    let projectId = null;

    if (currentProject) {
      try {
        const projectData = JSON.parse(currentProject);
        projectId = projectData.id;
      } catch (e) {
        console.error('解析当前项目数据失败:', e);
      }
    }

    const url = `/dashboard/${endpoint}`;
    const params: any = {};
    if (projectId) params.projectId = projectId;

    const response = await client.get(url, { params });
    return response.data;
  } catch (error: any) {
    console.error(`仪表盘API错误(${endpoint}):`, error.message);
    throw error;
  }
};

export const fetchAccountSummary = () => fetchDashboardData('account-summary');
export const fetchTransactionSummary = () => fetchDashboardData('transactions');
export const fetchIncomeBySubject = () => fetchDashboardData('income-by-subject');
export const fetchExpenseBySubject = () => fetchDashboardData('expense-by-subject');
export const fetchExpenseByDepartment = () => fetchDashboardData('expense-by-department');
