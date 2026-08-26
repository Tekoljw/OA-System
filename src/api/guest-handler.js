/**
 * 游客登录处理 - 已弃用
 * 
 * 注意：本模块中的本地模拟登录已被删除，
 * 所有登录都应该使用服务器端验证。
 */
export const handleGuestLogin = async () => {
  console.error('错误：本地模拟游客登录功能已被删除，请使用服务器端验证登录');
  throw new Error('本地模拟游客登录功能已被删除');
};