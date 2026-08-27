import axios from 'axios';

// 统一 API 基础 URL — 始终使用相对路径，由 Nginx 代理
const API_BASE_URL = '/api';

// 创建唯一的 axios 实例
const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// 请求拦截器：自动注入 token 和 projectId
client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 自动注入 projectId
  const url = config.url || '';
  if (!url.includes('/login') && !url.includes('/logout')) {
    const projectId = getCurrentProjectId();
    if (projectId && !config.params?.projectId) {
      config.params = { ...config.params, projectId };
    }
  }
  return config;
});

// 响应拦截器：统一错误处理
client.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 通用 API 请求函数
// 支持两种调用方式:
//   apiRequest(url, options)           — fetch 风格
//   apiRequest(method, url, data?)     — 简洁风格
export async function apiRequest(urlOrMethod: string, urlOrOptions?: string | RequestInit, data?: any): Promise<any> {
  let url: string;
  let options: RequestInit = {};

  // 判断调用方式：如果第一个参数是 HTTP method
  if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(urlOrMethod.toUpperCase())) {
    const method = urlOrMethod.toUpperCase();
    url = urlOrOptions as string;
    options = { method };
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
  } else {
    url = urlOrMethod;
    options = (urlOrOptions as RequestInit) || {};
  }

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let fullUrl = url.startsWith('/api') ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  // 自动注入 projectId（如果 URL 中没有）
  if (!fullUrl.includes('projectId') && !fullUrl.includes('/login') && !fullUrl.includes('/logout')) {
    const projectId = getCurrentProjectId();
    if (projectId) {
      const separator = fullUrl.includes('?') ? '&' : '?';
      fullUrl = `${fullUrl}${separator}projectId=${projectId}`;
    }
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    // 尝试解析错误消息
    try {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || errorData.message || `API Error: ${response.status}`);
    } catch (e) {
      if (e instanceof Error && !e.message.startsWith('API Error')) throw e;
      throw new Error(`API Error: ${response.status}`);
    }
  }

  return response.json();
}

// 兼容旧的 fetchAPI 签名
export async function fetchAPI(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
  const options: RequestInit = { method };
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }
  return apiRequest(endpoint, options);
}

// 获取当前项目 ID
export function getCurrentProjectId(): number | null {
  try {
    const projectStr = localStorage.getItem('currentProject');
    if (projectStr) {
      const project = JSON.parse(projectStr);
      return project?.id || null;
    }
    const projectId = localStorage.getItem('projectId');
    return projectId ? parseInt(projectId) : null;
  } catch {
    return null;
  }
}

// AUTH API 路径常量
export const AUTH_API = {
  LOGIN: `${API_BASE_URL}/login`,
  LOGOUT: `${API_BASE_URL}/logout`,
  USER: `${API_BASE_URL}/user`,
  PROJECTS: `${API_BASE_URL}/projects`,
  SWITCH_PROJECT: `${API_BASE_URL}/switch-project`,
};

// API_CONFIG 兼容导出
export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  getHeaders: () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }
};

export { API_BASE_URL };
export default client;
