/**
 * 环境配置
 * 替代 replit-fix.ts 和各种环境检测
 */

export const env = {
  // API 基础路径 — 始终使用相对路径
  API_BASE: '/api',

  // 是否为开发环境
  isDev: import.meta.env.DEV,

  // 是否为生产环境
  isProd: import.meta.env.PROD,
};
