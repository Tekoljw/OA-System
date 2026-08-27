/**
 * 统一API调用工具
 * 重构版：基于 src/api/client.ts 统一客户端
 */
import client from '../api/client';
import { apiRequest as baseApiRequest, fetchAPI as baseFetchAPI, getCurrentProjectId, API_BASE_URL } from '../api/client';

export { API_BASE_URL };

export const fetchAPI = baseFetchAPI;
export const apiRequest = baseApiRequest;

// API函数
export const apiService = {
  getCurrentUser: async () => {
    const response = await client.get('/api/user');
    return response.data;
  },

  login: async (username: string, password: string, projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.post('/api/login', { username, password }, { params });
    return response.data;
  },

  logout: async () => {
    await client.post('/api/logout');
  },

  getDepartments: async (projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/api/departments', { params });
    return response.data;
  },

  getAccounts: async (projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/api/accounts', { params });
    return response.data;
  },

  getDashboardData: async (endpoint: string, projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.get(`/api/dashboard/${endpoint}`, { params });
    return response.data;
  },

  switchProject: (projectId: number) => {
    localStorage.setItem('projectId', String(projectId));
    console.log(`已切换到项目 ${projectId}`);
  },

  getCurrentProjectId: () => getCurrentProjectId()
};

export const getManagerUsers = async (projectId?: number) => {
  try {
    const params: Record<string, any> = { role: 'manager' };
    if (projectId) params.projectId = projectId;
    const response = await client.get('/api/users', { params });
    return response.data;
  } catch (error) {
    console.error('获取管理者用户列表失败:', error);
    return [];
  }
};

export const getAllUsers = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/api/users', { params });
    return response.data;
  } catch (error) {
    console.error('获取所有用户失败:', error);
    return [];
  }
};

export const updateUser = async (userId: number | string, userData: any) => {
  const response = await client.put(`/api/users/${userId}`, userData);
  return response.data;
};

export const deleteUser = async (userId: number | string) => {
  const response = await client.delete(`/api/users/${userId}`);
  return response.data;
};

export const getRoles = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/api/roles', { params });
    return response.data;
  } catch (error) {
    console.error('获取角色列表失败:', error);
    return [];
  }
};

export default apiService;
