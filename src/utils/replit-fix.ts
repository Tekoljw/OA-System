/**
 * Replit环境修复工具
 * 专门处理Replit环境下的API请求和网络问题
 */

// 检测是否在Replit环境中
function isReplitEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  
  const host = window.location.hostname;
  return host.includes('.replit.dev') || 
         host.includes('.replit.app') || 
         host.includes('repl.co');
}

// 获取API基础URL
function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  
  // 根据环境确定API基础URL
  if (isReplitEnvironment()) {
    // 在Replit环境中，使用相对路径，不指定域名和端口
    // 这样Replit可以正确处理跨域问题
    console.log('使用相对路径API基础URL');
    return '';
  }
  
  // 开发环境或非Replit环境
  console.log('使用默认API基础URL');
  return '';
}

// 检查URL是否是API URL
function isApiUrl(url: string): boolean {
  return url.startsWith('/api/') || url.includes('/api/');
}

// 修复API URL
function fixApiUrl(url: string): string {
  // 已经是完整URL，不需要修复
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  const baseUrl = getApiBaseUrl();
  
  // 如果URL不是以/开头，添加/
  if (!url.startsWith('/')) {
    url = '/' + url;
  }
  
  return `${baseUrl}${url}`;
}

// 获取当前项目ID
function getCurrentProjectId(): number | null {
  if (typeof window === 'undefined') return null;
  
  // 优先从localStorage获取
  const storedProjectId = localStorage.getItem('current_project_id');
  if (storedProjectId) {
    return parseInt(storedProjectId, 10);
  }
  
  // 从URL参数获取
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdParam = urlParams.get('projectId');
  if (projectIdParam && !isNaN(parseInt(projectIdParam, 10))) {
    const parsedId = parseInt(projectIdParam, 10);
    console.log(`从URL获取项目ID: ${parsedId}`);
    // 保存到localStorage以便后续使用
    localStorage.setItem('current_project_id', parsedId.toString());
    return parsedId;
  }
  
  // 默认项目ID - 使用演示项目ID 2（如果没有设置）
  console.log('使用默认项目ID: 2');
  return 2;
}

// 设置当前项目ID
function setCurrentProjectId(projectId: number): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('current_project_id', projectId.toString());
}

// 导出工具方法
const ReplitFix = {
  isReplitEnvironment,
  getApiBaseUrl,
  isApiUrl,
  fixApiUrl,
  getCurrentProjectId,
  setCurrentProjectId
};

export default ReplitFix;