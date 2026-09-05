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
    const response = await client.get('/user');
    return response.data;
  },

  login: async (username: string, password: string, projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.post('/login', { username, password }, { params });
    return response.data;
  },

  logout: async () => {
    await client.post('/logout');
  },

  getDepartments: async (projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/departments', { params });
    return response.data;
  },

  getAccounts: async (projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/accounts', { params });
    return response.data;
  },

  getDashboardData: async (endpoint: string, projectId?: number) => {
    const params = projectId ? { projectId } : {};
    const response = await client.get(`/dashboard/${endpoint}`, { params });
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
    const response = await client.get('/users', { params });
    return response.data;
  } catch (error) {
    console.error('获取管理者用户列表失败:', error);
    return [];
  }
};

export const getAllUsers = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/users', { params });
    return response.data;
  } catch (error) {
    console.error('获取所有用户失败:', error);
    return [];
  }
};

/**
 * 修改当前登录用户自己的密码。
 *
 * 此前 NewHeader 用 await import('../../utils/api') 动态取 changePassword，
 * 而这个文件里根本没有这个导出 —— 解构拿到 undefined，点「确认」直接抛
 * TypeError，一个请求都不会发出，界面只弹一句「失败」。
 * 修改密码这个功能从来就没有工作过。
 *
 * 服务端要求改自己的密码必须带上当前密码，所以这里两个参数都是必填。
 */
export const changePassword = async (oldPassword: string, newPassword: string) => {
  const raw = localStorage.getItem('user');
  const me = raw ? JSON.parse(raw) : null;
  if (!me?.id) throw new Error('未获取到当前用户，请重新登录');
  const response = await client.put(`/users/${me.id}`, {
    oldPassword,
    password: newPassword,
  });
  return response.data;
};

export const updateUser = async (userId: number | string, userData: any) => {
  const response = await client.put(`/users/${userId}`, userData);
  return response.data;
};

export const deleteUser = async (userId: number | string) => {
  const response = await client.delete(`/users/${userId}`);
  return response.data;
};

export const getRoles = async (projectId?: number) => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await client.get('/roles', { params });
    return response.data;
  } catch (error) {
    console.error('获取角色列表失败:', error);
    return [];
  }
};

export default apiService;
