/**
 * API路由辅助工具
 * 在浏览器控制台中运行，帮助前端应用直接连接到API代理服务器，绕过Vite开发服务器
 */

(function() {
  // 全局钩子函数，用于修复API请求
  window.fixApiRequests = function() {
    const apiProxyUrl = 'http://localhost:5001'; // API代理服务器地址
    
    console.log('开始修复API请求路由...');
    
    // 保存原始的fetch函数
    const originalFetch = window.fetch;
    
    // 重写fetch函数，将API请求重定向到API代理服务器
    window.fetch = function(url, options) {
      let modifiedUrl = url;
      
      if (typeof url === 'string' && url.startsWith('/api')) {
        modifiedUrl = `${apiProxyUrl}${url}`;
        console.log(`[API路由器] 重定向请求: ${url} -> ${modifiedUrl}`);
      }
      
      return originalFetch.call(this, modifiedUrl, options);
    };
    
    // 修复XMLHttpRequest，重定向API请求
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      let modifiedUrl = url;
      
      if (typeof url === 'string' && url.startsWith('/api')) {
        modifiedUrl = `${apiProxyUrl}${url}`;
        console.log(`[API路由器] 重定向XHR请求: ${url} -> ${modifiedUrl}`);
      }
      
      return originalOpen.call(this, method, modifiedUrl, async, user, password);
    };
    
    // 如果项目使用axios，尝试全局修改其baseURL
    if (window.axios) {
      console.log('检测到axios，修改其全局配置');
      window.axios.defaults.baseURL = apiProxyUrl;
    }
    
    console.log('API请求路由修复完成');
    return 'API请求已重定向到代理服务器: ' + apiProxyUrl;
  };
  
  // 自动执行
  console.log('API路由修复工具已加载，运行window.fixApiRequests()以启用');
})();