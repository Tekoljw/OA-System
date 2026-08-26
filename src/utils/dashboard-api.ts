/**
 * 仪表盘API专用工具函数
 * 
 * 这个文件包含仪表盘专用的API请求函数，确保所有仪表盘数据请求能正确处理。
 * 与一般API请求相比，仪表盘数据需要使用特定的API端点，因此需要特殊处理。
 */

import axiosInstance from './axios-config-fixed';
import apiService from './api';

/**
 * 获取仪表盘数据的通用函数
 * @param endpoint 仪表盘API端点
 * @returns 请求结果Promise
 */
export const fetchDashboardData = async (endpoint: string) => {
  try {
    console.log(`开始获取仪表盘数据(${endpoint})`);
    
    // 从localStorage获取当前项目ID
    const currentProject = localStorage.getItem('currentProject');
    let projectId = null;
    
    if (currentProject) {
      try {
        const projectData = JSON.parse(currentProject);
        projectId = projectData.id;
        console.log(`获取${endpoint}数据, 项目ID:`, projectId);
      } catch (e) {
        console.error('解析当前项目数据失败:', e);
      }
    }
    
    // 构建API URL，确保使用项目ID
    const url = `/api/dashboard/${endpoint}`;
    
    // 准备请求参数
    const params: any = {};
    if (projectId) {
      params.projectId = projectId;
    }
    
    console.log(`发送仪表盘API请求: ${url}`, params);
    console.log(`完整URL (带baseURL): ${axiosInstance.defaults.baseURL}${url}`);
    
    // 使用axios实例发送请求，确保传递params
    const response = await axiosInstance.get(url, { params });
    
    console.log(`仪表盘API响应(${endpoint}):`, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    });
    
    // 返回响应数据
    return response.data;
  } catch (error: any) {
    console.error(`仪表盘API错误(${endpoint}):`, {
      message: error.message,
      config: error.config,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      } : 'No response'
    });
    
    // 如果响应是HTML而不是JSON，记录详细信息
    if (error.response && 
        error.response.headers && 
        error.response.headers['content-type'] && 
        error.response.headers['content-type'].includes('text/html')) {
      console.error('收到HTML响应而非JSON:', {
        url: error.config.url,
        contentType: error.response.headers['content-type'],
        dataPreview: typeof error.response.data === 'string' 
          ? error.response.data.substring(0, 150) + '...' 
          : 'Not a string'
      });
    }
    
    throw error;
  }
};

/**
 * 获取账户摘要数据
 * @returns 账户摘要数据Promise
 */
export const fetchAccountSummary = async () => {
  return fetchDashboardData('account-summary');
};

/**
 * 获取交易摘要数据
 * @returns 交易摘要数据Promise
 */
export const fetchTransactionSummary = async () => {
  return fetchDashboardData('transactions');
};

/**
 * 获取收入按科目分析数据
 * @returns 收入按科目分析数据Promise
 */
export const fetchIncomeBySubject = async () => {
  return fetchDashboardData('income-by-subject');
};

/**
 * 获取支出按科目分析数据
 * @returns 支出按科目分析数据Promise
 */
export const fetchExpenseBySubject = async () => {
  return fetchDashboardData('expense-by-subject');
};

/**
 * 获取支出按部门分析数据
 * @returns 支出按部门分析数据Promise
 */
export const fetchExpenseByDepartment = async () => {
  return fetchDashboardData('expense-by-department');
};