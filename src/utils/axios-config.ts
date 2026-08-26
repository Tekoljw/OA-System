/**
 * Axios配置模块
 * 为所有axios请求添加拦截器，确保正确传递项目ID
 */

import axios from 'axios';

// 创建axios实例 - 使用专用API代理服务器
// 收集环境信息以便诊断
console.log('Axios配置 - 使用专用API代理服务器');
console.log('当前页面URL:', window.location.href);
console.log('浏览器运行环境:', navigator.userAgent);

// 定义PHP后端服务器端口
const PHP_BACKEND_PORT = 5000; // 直接连接到PHP后端服务器

// 确定我们处于什么环境，并设置相应的baseURL
let baseURL = '';

// 直接连接到API代理服务器
// 为了解决Vite开发服务器不正确转发API请求的问题
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1';

if (isLocalDevelopment) {
  // 本地开发环境，直接连接到PHP后端端口
  baseURL = `http://localhost:${PHP_BACKEND_PORT}`;
  console.log(`本地开发环境: 直接连接到PHP后端服务器: ${baseURL}`);
} else {
  // 在Replit环境中
  console.log('在Replit环境中');
  
  // 在Replit环境中，使用相对路径而不是带端口的完整URL
  // Replit不支持HTTPS与非标准端口的组合
  baseURL = '';
  console.log(`Replit环境: 使用相对路径，不设置baseURL`);
}

console.log('最终API基础URL:', baseURL);

// 为调试目的，创建全局服务器配置函数
(window as any).useApiProxy = (useProxy: boolean) => {
  if (useProxy) {
    localStorage.setItem('use_api_proxy', 'true');
    console.log(`已启用API代理，刷新页面以应用更改`);
  } else {
    localStorage.removeItem('use_api_proxy');
    console.log(`已禁用API代理，刷新页面以应用更改`);
  }
};

// 添加登录API辅助函数，避免前端路由和后端路由混淆
(window as any).fixAuth = () => {
  console.log('修复认证请求基础URL');
  
  // 修改登录、登出等请求的URL，使用完整URL而不是相对路径
  const loginEl = document.querySelector('form[action="/login"]');
  if (loginEl) {
    loginEl.setAttribute('action', `${baseURL}/login`);
    console.log('已修复登录表单目标URL');
  }
};

const axiosInstance = axios.create({
  baseURL: baseURL,
});

/**
 * 获取当前项目ID
 * 从localStorage中获取当前项目ID
 * @returns 当前项目ID或null
 */
export const getCurrentProjectId = (): number | null => {
  // 从localStorage获取当前项目ID
  const currentProject = localStorage.getItem('currentProject');
  let projectId = null;
  
  console.log('getCurrentProjectId - currentProject存储:', currentProject);
  
  if (currentProject) {
    try {
      const projectData = JSON.parse(currentProject);
      projectId = projectData.id;
      console.log('解析到的项目ID (从currentProject):', projectId);
    } catch (e) {
      console.error('解析当前项目数据失败:', e);
    }
  }
  
  // 如果未找到currentProject，尝试从user对象获取
  if (!projectId) {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        console.log('用户数据中的项目信息:', {
          hasCurrentProject: !!user.currentProject,
          currentProjectId: user.currentProject?.id,
          projectId: user.projectId
        });
        
        if (user.currentProject && user.currentProject.id) {
          projectId = user.currentProject.id;
          console.log('解析到的项目ID (从user.currentProject):', projectId);
        } else if (user.projectId) {
          projectId = user.projectId;
          console.log('解析到的项目ID (从user.projectId):', projectId);
        }
      } catch (e) {
        console.error('解析用户数据失败:', e);
      }
    }
  }
  
  console.log('最终使用的项目ID:', projectId);
  return projectId;
};

// 不需要项目ID的端点列表 - 明确只列出不需要projectId的URL
const noProjectIdNeededUrls = [
  '/api/login', 
  '/api/user', 
  '/api/projects', 
  '/api/logout',
  '/api/register',
  '/api/super-admin'
];

// 请求拦截器
axiosInstance.interceptors.request.use((config) => {
  // 获取完整的请求URL（包含baseURL）
  const fullUrl = (config.baseURL || '') + (config.url || '');
  console.log(`Axios请求完整URL: ${fullUrl}`);
  
  // 获取项目ID
  const projectId = getCurrentProjectId();
  console.log(`当前项目ID: ${projectId}`);
  
  // 检查URL是否需要projectId
  const url = config.url || '';
  const needsProjectId = !noProjectIdNeededUrls.some(allowedUrl => url.startsWith(allowedUrl));
  console.log(`URL ${url} 需要项目ID? ${needsProjectId}`);
  
  // 如果有项目ID且端点需要项目ID，添加到查询参数
  if (projectId && needsProjectId) {
    // 确保params对象存在
    config.params = config.params || {};
    // 添加projectId
    config.params.projectId = projectId;
    console.log(`Axios请求添加项目ID: ${projectId}, URL: ${config.url}, 最终URL: ${fullUrl}?projectId=${projectId}`);
  } else if (needsProjectId) {
    console.warn(`警告: 未找到项目ID，API请求可能失败: ${config.url}`);
  }
  
  // 添加授权头
  const token = localStorage.getItem('token');
  if (token) {
    if (!config.headers) {
      config.headers = {} as any;
    }
    config.headers.Authorization = `Bearer ${token}`;
    console.log(`已添加授权头到 ${config.url}`);
  }
  
  console.log('最终请求配置:', {
    url: config.url,
    baseURL: config.baseURL,
    method: config.method,
    params: config.params,
    headers: config.headers
  });
  
  return config;
});

// 响应拦截器 - 用于处理错误和记录响应
axiosInstance.interceptors.response.use(
  response => {
    // 记录成功的响应
    console.log(`请求成功 [${response.status}]: ${response.config.url}`, {
      data: response.data,
      headers: response.headers,
      status: response.status
    });
    return response;
  },
  error => {
    // 详细记录错误信息
    console.error('请求失败:', {
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      method: error.config?.method,
      params: error.config?.params,
      headers: error.config?.headers,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      message: error.message
    });
    
    // 如果是HTML响应（而不是预期的JSON），记录详细信息
    if (error.response && error.response.headers && 
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
    
    // 如果是projectId相关错误，记录详细信息
    if (error.response && error.response.status === 400 && 
        error.response.data && error.response.data.error && 
        error.response.data.error.includes('项目ID')) {
      console.error('项目ID错误:', {
        url: error.config.url,
        params: error.config.params,
        projectId: getCurrentProjectId(),
        errorMessage: error.response.data.error
      });
    }
    
    return Promise.reject(error);
  }
);

// 导出配置好的axios实例
export default axiosInstance;