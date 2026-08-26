/**
 * API配置文件
 * 为前端应用提供PHP后端API地址
 */

// 设置API基础URL为PHP后端服务器地址
window.API_CONFIG = {
  BASE_URL: "http://localhost:5000",
  API_PATH: "/api"
};

console.log("已加载API配置:", window.API_CONFIG);

// 将此配置添加到全局window对象，方便其他模块使用
// 获取API配置
const API_CONFIG = window.API_CONFIG || {
  // 默认使用当前域名作为API基础路径
  API_BASE_URL: '/api'
};

export const apiConfig = API_CONFIG;