/**
 * API修复模块
 * 用于处理在Vite开发服务器直接访问时的API请求问题
 */

// 检查是否需要应用API修复
function checkAndApplyAPIFix() {
  // 获取当前页面URL
  const currentURL = window.location.href;
  console.log("当前页面URL:", currentURL);
  console.log("浏览器运行环境:", navigator.userAgent);
  
  // 检查是否在Vite服务器上直接访问（端口3001）
  const isViteServerDirect = window.location.port === '3001';
  
  if (isViteServerDirect) {
    console.log("⚠️ 在Vite服务器上直接访问，需要重定向API请求到APIProxy");
    console.log("正在应用API修复...");
    
    // 获取当前hostname并移除端口
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // 在Replit环境中，使用无端口的URL
    const baseUrl = `${protocol}//${hostname}`;
    console.log("当前页面URL:", currentURL);
    
    console.log("前端服务器模式，设置API请求BASE_URL为:", baseUrl);
    
    // 存储全局配置，供任何组件使用
    window.API_CONFIG = {
      BASE_URL: baseUrl,
      API_PATH: "/api"
    };
    
    // 替换原始的fetch函数
    const originalFetch = window.fetch;
    
    // 创建一个新的全局fetch函数
    window.fetch = async function(url: RequestInfo | URL, options?: RequestInit) {
      try {
        let requestUrl = url.toString();
        
        // 处理API请求
        if (requestUrl.includes('/api/')) {
          // API路径检测 - 处理相对和绝对URL
          if (requestUrl.startsWith('/api/')) {
            // 相对路径API请求，添加基础URL
            requestUrl = `${baseUrl}${requestUrl}`;
            console.log("API请求重定向(相对路径):", requestUrl);
          } else if (requestUrl.includes('://')) {
            // 绝对路径API请求，替换主机部分
            try {
              const urlObj = new URL(requestUrl);
              if (urlObj.pathname.includes('/api/')) {
                const newUrl = `${baseUrl}${urlObj.pathname}${urlObj.search}`;
                console.log("API请求重定向(绝对路径):", requestUrl, "->", newUrl);
                requestUrl = newUrl;
              }
            } catch (error) {
              console.error("URL解析错误:", error);
            }
          }
        }
        
        // 使用原始fetch发送请求
        return originalFetch(requestUrl, options);
      } catch (error) {
        console.error("Fetch拦截器错误:", error);
        return originalFetch(url, options);
      }
    };
    
    console.log("API修复已应用 - API请求将使用基础URL:", baseUrl);
  }
}

// 为TypeScript定义全局配置对象
declare global {
  interface Window {
    API_CONFIG?: {
      BASE_URL: string;
      API_PATH: string;
    };
  }
}

// 当文档加载完成后应用修复
if (typeof window !== 'undefined') {
  // 立即执行API修复
  checkAndApplyAPIFix();
  
  // 确保在页面完全加载后也执行，以防止任何时序问题
  window.addEventListener('DOMContentLoaded', () => {
    checkAndApplyAPIFix();
  });
}

// 获取API基础URL
const getApiBaseUrl = () => {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined') {
    return ''; // 非浏览器环境
  }
  
  // 检查API_CONFIG是否已被api-fix模块设置
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    return window.API_CONFIG.BASE_URL;
  }
  
  // 检测是否在Replit环境中
  const isReplitEnv = window.location.hostname.endsWith('.replit.dev');
  
  if (isReplitEnv) {
    // 在Replit环境中，使用相对URL或本地路径
    console.log('在Replit环境中使用相对URL');
    
    // 获取当前URL的协议和主机名部分
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    // 检查如果端口是3001，那么我们正在直接访问Vite服务器
    if (window.location.port === '3001') {
      // 修改为使用主域名，避免端口
      console.log('⚠️ 在Vite服务器上直接访问，使用主域名');
      return `${protocol}//${hostname.split(':')[0]}`;
    }
    
    // 在Replit环境中不应该添加端口号，直接使用当前域名
    return `${protocol}//${hostname}`;
  } else {
    // 本地开发环境，直接连接到API代理
    console.log('本地开发环境，使用APIProxy 5000端口');
    return 'http://localhost:5000';
  }
};

// 通用的API请求函数
export const apiRequest = async (method: string, url: string, data?: any) => {
  try {
    console.log(`API请求: ${method} ${url}`);
    
    // 获取API基础URL
    const baseUrl = getApiBaseUrl();
    
    // 添加授权请求头
    const authHeaders = (() => {
      const token = localStorage.getItem('token');
      if (token) {
        return { 'Authorization': `Bearer ${token}` };
      }
      return {};
    })();
    
    const options: RequestInit = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      mode: 'cors'
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(data);
      console.log('请求数据:', options.body);
    }

    console.log(`发送请求到: ${baseUrl}${url}`, options);
    
    const response = await fetch(`${baseUrl}${url}`, options);
    
    if (response.ok) {
      // 尝试解析JSON响应
      try {
        const text = await response.text();
        const result = text ? JSON.parse(text) : {};
        console.log(`API响应(${url}):`, result);
        return result;
      } catch (error) {
        console.error('解析响应失败:', error);
        throw new Error('服务器响应格式无效');
      }
    } else {
      const errorText = await response.text();
      console.error(`API错误(${response.status}):`, errorText);
      
      // 尝试解析错误JSON
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.message || `请求失败(${response.status})`);
      } catch (e) {
        throw new Error(`请求失败(${response.status}): ${errorText}`);
      }
    }
  } catch (error: any) {
    console.error(`API请求异常(${url}):`, error);
    throw error;
  }
};