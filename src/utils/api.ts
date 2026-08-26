/**
 * 统一API调用工具
 * 这个文件整合了修复后的axios配置，并提供了友好的API调用接口
 */
import axiosInstance, { api } from './axios-config-fixed';
import ReplitFix from './replit-fix';

// API基础URL - 用于兼容旧代码
export const API_BASE_URL = ReplitFix.getApiBaseUrl();

/**
 * 通用API请求函数 - 为了兼容旧代码
 * 简化版fetch API，通过method和query参数自动构建请求
 * @param url API端点URL
 * @param method HTTP方法
 * @param query 查询参数(用于所有请求)
 * @param data 请求数据(用于POST/PUT/DELETE)
 * @returns Promise<any> 响应数据
 */
export const fetchAPI = async (
  url: string, 
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  query: Record<string, any> = {},
  data?: any
) => {
  // 添加项目ID查询参数
  const projectId = ReplitFix.getCurrentProjectId();
  if (projectId) {
    query = { ...query, projectId };
  }
  
  // 构建查询字符串
  const queryStr = Object.keys(query).length 
    ? '?' + new URLSearchParams(query as any).toString() 
    : '';
  
  try {
    // 预处理URL，确保正确的API基础路径
    const fixedUrl = ReplitFix.isApiUrl(url) ? ReplitFix.fixApiUrl(url) : url;
    const fullUrl = `${fixedUrl}${queryStr}`;
    
    // 使用axios发送请求
    const config = {
      method,
      url: fullUrl,
      data: data,
    };
    
    console.log(`通过fetchAPI发送请求: ${method} ${fullUrl}`, { data });
    
    const response = await axiosInstance(config);
    return response.data;
  } catch (error) {
    console.error(`fetchAPI错误: ${method} ${url}`, error);
    throw error;
  }
};

/**
 * 通用API请求函数 - 为了兼容旧代码
 * @param method HTTP方法
 * @param url API端点URL
 * @param data 请求数据(用于POST/PUT/DELETE)
 * @returns Promise<any> 响应数据
 */
export const apiRequest = async (method: string, url: string, data?: any) => {
  try {
    // 预处理URL，确保正确的API基础路径
    const fixedUrl = ReplitFix.isApiUrl(url) ? ReplitFix.fixApiUrl(url) : url;
    
    // 使用axios发送请求
    const config = {
      method: method as any,
      url: fixedUrl,
      data: data,
      params: ReplitFix.getCurrentProjectId() ? { projectId: ReplitFix.getCurrentProjectId() } : {}
    };
    
    console.log(`通过apiRequest发送请求: ${method} ${fixedUrl}`, config);
    
    const response = await axiosInstance(config);
    return response.data;
  } catch (error) {
    console.error(`apiRequest错误: ${method} ${url}`, error);
    throw error;
  }
};

// 通用错误处理
const handleApiError = (error: any) => {
  console.error('API请求失败:', error);
  
  // 将错误转换为统一格式
  const standardError = {
    message: error.message || '未知错误',
    status: error.response?.status,
    details: error.response?.data || error.details || {}
  };
  
  throw standardError;
};

// API函数
export const apiService = {
  /**
   * 获取当前用户信息
   * @returns {Promise<any>} 用户信息
   */
  getCurrentUser: async () => {
    try {
      const response = await api.get('/api/user');
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },
  
  /**
   * 登录
   * @param {string} username 用户名
   * @param {string} password 密码
   * @param {number} projectId 项目ID (可选)
   * @returns {Promise<any>} 登录结果
   */
  login: async (username: string, password: string, projectId?: number) => {
    try {
      const params = projectId ? { projectId } : {};
      const response = await api.post('/api/login', { username, password }, { params });
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },
  
  /**
   * 登出
   * @returns {Promise<void>}
   */
  logout: async () => {
    try {
      await api.post('/api/logout');
    } catch (error) {
      handleApiError(error);
    }
  },
  
  /**
   * 获取部门列表
   * @param {number} projectId 项目ID (可选)
   * @returns {Promise<any[]>} 部门列表
   */
  getDepartments: async (projectId?: number) => {
    try {
      const params = projectId ? { projectId } : {};
      const response = await api.get('/api/departments', { params });
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },
  
  /**
   * 获取账户列表
   * @param {number} projectId 项目ID (可选)
   * @returns {Promise<any[]>} 账户列表
   */
  getAccounts: async (projectId?: number) => {
    try {
      const params = projectId ? { projectId } : {};
      const response = await api.get('/api/accounts', { params });
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },
  
  /**
   * 获取仪表盘数据
   * @param {string} endpoint 仪表盘端点
   * @param {number} projectId 项目ID (可选)
   * @returns {Promise<any>} 仪表盘数据
   */
  getDashboardData: async (endpoint: string, projectId?: number) => {
    try {
      const params = projectId ? { projectId } : {};
      const response = await api.get(`/api/dashboard/${endpoint}`, { params });
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },
  
  /**
   * 切换项目
   * @param {number} projectId 项目ID
   */
  switchProject: (projectId: number) => {
    ReplitFix.setCurrentProjectId(projectId);
    // 可以在这里添加额外的项目切换逻辑
    console.log(`已切换到项目 ${projectId}`);
  },
  
  /**
   * 获取当前项目ID
   * @returns {number|null} 当前项目ID
   */
  getCurrentProjectId: () => {
    return ReplitFix.getCurrentProjectId();
  }
};

/**
 * 获取可担任管理者角色的用户列表
 * @param projectId 可选项目ID
 * @returns 用户列表
 */
export const getManagerUsers = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await api.get('/api/users', { 
      params: { 
        ...params,
        role: 'manager' 
      } 
    });
    return response.data;
  } catch (error) {
    console.error('获取管理者用户列表失败:', error);
    return [];
  }
};

/**
 * 获取所有用户
 * @param projectId 可选项目ID  
 * @returns 用户列表
 */
export const getAllUsers = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await api.get('/api/users', { params });
    return response.data;
  } catch (error) {
    console.error('获取所有用户失败:', error);
    return [];
  }
};

/**
 * 更新用户信息
 * @param userId 用户ID
 * @param userData 用户数据
 * @returns 更新结果
 */
export const updateUser = async (userId: number | string, userData: any) => {
  try {
    const response = await api.put(`/api/users/${userId}`, userData);
    return response.data;
  } catch (error) {
    console.error('更新用户失败:', error);
    throw error;
  }
};

/**
 * 删除用户
 * @param userId 用户ID
 * @returns 删除结果
 */
export const deleteUser = async (userId: number | string) => {
  try {
    const response = await api.delete(`/api/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('删除用户失败:', error);
    throw error;
  }
};

/**
 * 获取角色列表
 * @param {number} projectId 项目ID (可选)
 * @returns {Promise<any[]>} 角色列表
 */
export const getRoles = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await api.get('/api/roles', { params });
    return response.data;
  } catch (error) {
    console.error('获取角色列表失败:', error);
    return [];
  }
};

// 默认导出
export default apiService;