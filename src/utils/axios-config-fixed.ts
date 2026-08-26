/**
 * 修复后的Axios配置
 * 针对Replit环境和跨域请求进行了优化
 */
import axios, { AxiosRequestConfig } from 'axios';
import ReplitFix from './replit-fix';

// 创建axios实例
const axiosInstance = axios.create({
  // 不设置baseURL，而是在请求拦截器中动态修复URL
  timeout: 15000,  // 超时时间15秒
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true, // 重要：确保跨域请求能够携带cookies
});

// 添加请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    // 保存原始URL以便调试
    const originalUrl = config.url || '';
    
    // 检查URL是否是API请求
    if (originalUrl && ReplitFix.isApiUrl(originalUrl)) {
      // 修复URL，添加合适的基础URL（如果需要）
      config.url = ReplitFix.fixApiUrl(originalUrl);
      
      // 为API请求自动添加projectId参数（如适用）
      if (!config.params) {
        config.params = {};
      }
      
      // 如果请求参数中没有projectId，添加当前项目ID
      if (!config.params.projectId) {
        const projectId = ReplitFix.getCurrentProjectId();
        if (projectId) {
          config.params.projectId = projectId;
        }
      }
      
      // 添加额外的调试信息
      if (process.env.NODE_ENV === 'development') {
        console.log(`API请求: ${originalUrl} => ${config.url}`, config);
      }
    }
    
    return config;
  },
  (error) => {
    // 请求错误处理
    console.error('Axios请求发送失败:', error);
    return Promise.reject(error);
  }
);

// 添加响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    // 响应数据成功处理
    return response;
  },
  (error) => {
    // 响应错误处理
    if (error.response) {
      // 服务器返回了错误状态码
      console.error('API请求失败:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
      
      // 未认证错误（401）
      if (error.response.status === 401) {
        // 检查是否在登录页面
        const isLoginPage = window.location.pathname.includes('/login');
        if (!isLoginPage) {
          console.log('未认证，重定向到登录页面');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1000);
        }
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      console.error('无响应:', error.request);
      
      // 可能是网络连接问题或服务器未启动
      const originalUrl = error.config?.url || '';
      const isApiUrl = ReplitFix.isApiUrl(originalUrl);
      
      if (isApiUrl) {
        // 尝试将错误信息提供给用户
        const eventName = 'api-connection-error';
        const errorDetail = {
          url: originalUrl,
          message: '无法连接到服务器，请检查网络连接',
          timestamp: new Date().toISOString(),
          requestId: Math.random().toString(36).substring(2, 15)
        };
        
        // 发送事件，让组件可以监听并显示错误
        const event = new CustomEvent(eventName, { detail: errorDetail });
        window.dispatchEvent(event);
        
        // 记录到控制台以便调试
        console.error(`API连接错误 [${errorDetail.requestId}]:`, {
          url: originalUrl,
          message: '服务器未响应，可能是连接问题或服务未启动'
        });
      }
    } else {
      // 设置请求时发生错误
      console.error('请求错误:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// 公开API函数
export const api = {
  // GET请求
  get: (url: string, config?: AxiosRequestConfig) => axiosInstance.get(url, config),
  
  // POST请求
  post: (url: string, data?: any, config?: AxiosRequestConfig) => axiosInstance.post(url, data, config),
  
  // PUT请求
  put: (url: string, data?: any, config?: AxiosRequestConfig) => axiosInstance.put(url, data, config),
  
  // DELETE请求
  delete: (url: string, config?: AxiosRequestConfig) => axiosInstance.delete(url, config),
  
  // 设置公共头信息
  setCommonHeader: (key: string, value: string) => {
    axiosInstance.defaults.headers.common[key] = value;
  },
  
  // 移除公共头信息
  removeCommonHeader: (key: string) => {
    delete axiosInstance.defaults.headers.common[key];
  }
};

// 默认导出axios实例
export default axiosInstance;