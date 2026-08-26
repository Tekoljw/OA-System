/**
 * API配置修复模块
 * 将前端API请求指向我们的API路由修复服务
 */

// 原始API基础URL
const originalApiBaseUrl = 'https://d1842bdc-6bb6-4892-80ad-9ec6653c0c5e-00-3pbxb22fc7ucd.worf.replit.dev';

// 新的API路由修复服务URL (运行在端口7000)
const fixedApiBaseUrl = 'https://d1842bdc-6bb6-4892-80ad-9ec6653c0c5e-00-3pbxb22fc7ucd.worf.replit.dev:7000';

// 修复API URL的函数
export function fixApiUrl(url) {
  // 如果URL已经以fixedApiBaseUrl开头，不进行修改
  if (url.startsWith(fixedApiBaseUrl)) {
    return url;
  }
  
  // 将原始API基础URL替换为修复版本
  if (url.startsWith(originalApiBaseUrl)) {
    return url.replace(originalApiBaseUrl, fixedApiBaseUrl);
  }
  
  // 如果是相对URL（以/api开头），添加修复版本的基础URL
  if (url.startsWith('/api')) {
    return `${fixedApiBaseUrl}${url}`;
  }
  
  // 其他情况保持不变
  return url;
}

// 将此脚本注入到全局作用域
(function injectApiUrlFix() {
  // 保存原始的fetch函数
  const originalFetch = window.fetch;
  
  // 用修复版本替换原始fetch
  window.fetch = function(url, options) {
    const fixedUrl = fixApiUrl(url);
    console.log(`[API修复] ${url} => ${fixedUrl}`);
    return originalFetch(fixedUrl, options);
  };
  
  // 监听DOM加载完成，修复Axios配置
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[API修复] 页面加载完成，监听Axios请求...');
    
    // 如果axios已定义，拦截请求
    if (window.axios) {
      window.axios.interceptors.request.use(config => {
        if (config.url) {
          config.url = fixApiUrl(config.url);
          console.log(`[API修复-Axios] 修改请求URL: ${config.url}`);
        }
        return config;
      });
    }
  });
  
  console.log('[API修复] API URL修复脚本已注入');
})();

export default { fixApiUrl };