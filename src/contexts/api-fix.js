/**
 * API 网络配置修复脚本
 * 这个脚本会在页面加载时注入，用于修复API请求的主机地址问题
 */

console.log("正在应用API修复...");

// 获取当前页面地址
const currentHost = window.location.host;
const protocol = window.location.protocol;
const currentUrl = `${protocol}//${currentHost}`;

console.log("当前页面URL:", currentUrl);
console.log("浏览器运行环境:", navigator.userAgent);

// 检测运行环境是否为Replit
function isReplitEnvironment() {
  return currentHost.includes('.replit.dev') || 
         currentHost.includes('replit.app') || 
         currentHost.includes('repl.co');
}

// 全局API配置
window.API_CONFIG = {
  BASE_URL: '',  // 同一主机时使用空字符串为API基础URL
  API_PATH: '/api'
};

// 在Replit环境中运行时，针对不同端口进行处理
if (isReplitEnvironment()) {
  console.log("在Replit环境中设置认证服务器URL");
  
  // 检查当前端口是否为3001（前端开发服务器）
  if (window.location.port === '3001') {
    // 前端开发服务器情况下，需要明确指向认证服务器的地址
    const baseUrl = `${window.location.protocol}//${window.location.hostname}`;
    window.API_CONFIG.BASE_URL = baseUrl;
    console.log("前端服务器模式，设置认证服务器BASE_URL为:", baseUrl);
  } else {
    // 统一代理情况，可以使用相对URL
    console.log("统一代理模式，使用相对URL");
  }
} else {
  // 本地开发环境
  console.log("在本地开发环境中设置认证服务器URL");
  window.API_CONFIG.BASE_URL = 'http://localhost:5500'; // 注意：这里使用SimpleAuth的端口5500
}

// 导出以供其他模块使用
export const API_CONFIG = window.API_CONFIG;

console.log("API修复已应用 - API请求将使用当前主机", window.API_CONFIG.BASE_URL || currentUrl);