/**
 * 直接API访问模块
 * 绕过Vite开发服务器，直接连接到后端API
 */

import axios from 'axios';

// 创建API客户端
const apiClient = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
});

// 导出API访问函数
export const directAPI = {
  /**
   * 获取币种列表
   * @param {number} projectId - 项目ID
   * @returns {Promise<Array>} - 币种列表
   */
  getCurrencyTypes: async (projectId) => {
    try {
      console.log('直接API请求: 获取币种列表, 项目ID:', projectId);
      const response = await apiClient.get(`/currency-types?projectId=${projectId}`);
      console.log('币种列表API响应:', response.data);
      
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      return [];
    } catch (error) {
      console.error('获取币种列表失败:', error);
      return [];
    }
  },
  
  /**
   * 获取账户类型列表
   * @param {number} projectId - 项目ID
   * @returns {Promise<Array>} - 账户类型列表
   */
  getAccountTypes: async (projectId) => {
    try {
      console.log('直接API请求: 获取账户类型列表, 项目ID:', projectId);
      const response = await apiClient.get(`/account-types?projectId=${projectId}`);
      console.log('账户类型API响应:', response.data);
      
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      return [];
    } catch (error) {
      console.error('获取账户类型列表失败:', error);
      return [];
    }
  },
  
  /**
   * 获取账户列表
   * @param {number} projectId - 项目ID
   * @param {Object} params - 过滤参数
   * @returns {Promise<Array>} - 账户列表
   */
  getAccounts: async (projectId, params = {}) => {
    try {
      console.log('直接API请求: 获取账户列表, 项目ID:', projectId);
      const response = await apiClient.get(`/accounts`, {
        params: {
          projectId,
          ...params
        }
      });
      console.log('账户列表API响应:', response.data);
      
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      return [];
    } catch (error) {
      console.error('获取账户列表失败:', error);
      return [];
    }
  }
};

// 导出获取项目ID函数
export const getCurrentProjectId = () => {
  // 从localStorage获取
  try {
    const currentProject = localStorage.getItem('currentProject');
    if (currentProject) {
      const projectData = JSON.parse(currentProject);
      if (projectData && projectData.id) {
        return projectData.id;
      }
    }
    
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      if (user && user.currentProject && user.currentProject.id) {
        return user.currentProject.id;
      }
      if (user && user.projectId) {
        return user.projectId;
      }
    }
  } catch (e) {
    console.error('解析项目ID失败:', e);
  }
  
  // 默认项目ID
  return 2;
};

// 提供一个初始化函数，可以在应用启动时调用
export const initializeAPI = () => {
  console.log('初始化直接API连接到后端:', apiClient.defaults.baseURL);
  
  // 添加请求拦截器
  apiClient.interceptors.request.use(
    (config) => {
      console.log(`发送请求: ${config.method?.toUpperCase()} ${config.url}`, config.params || {});
      return config;
    },
    (error) => {
      console.error('请求错误:', error);
      return Promise.reject(error);
    }
  );

  // 添加响应拦截器
  apiClient.interceptors.response.use(
    (response) => {
      console.log(`响应成功: ${response.status}`, {
        url: response.config.url,
        statusText: response.statusText,
        contentType: response.headers['content-type']
      });
      return response;
    },
    (error) => {
      console.error('响应错误:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
      return Promise.reject(error);
    }
  );
  
  // 返回一个测试API连接的函数
  return {
    testConnection: async () => {
      try {
        // 测试币种API
        const currencies = await directAPI.getCurrencyTypes(getCurrentProjectId());
        return {
          success: true,
          message: '连接成功',
          data: {
            currencyCount: currencies.length,
            firstCurrency: currencies[0]
          }
        };
      } catch (error) {
        return {
          success: false,
          message: '连接失败: ' + error.message
        };
      }
    }
  };
};

export default directAPI;