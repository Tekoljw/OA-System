/**
 * API修复上下文
 * 为整个应用程序提供统一的API配置和环境修复
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import ReplitFix from '../utils/replit-fix';

// 配置对象类型定义
export interface ApiConfig {
  apiBaseUrl: string;
  isReplitEnvironment: boolean;
  apiProxyEnabled: boolean;
  projectId: number | null;
}

// 默认配置
const DEFAULT_API_CONFIG: ApiConfig = {
  apiBaseUrl: '',
  isReplitEnvironment: false,
  apiProxyEnabled: false,
  projectId: null
};

// 构建实际API配置
const getInitialConfig = (): ApiConfig => ({
  apiBaseUrl: ReplitFix.getApiBaseUrl(),
  isReplitEnvironment: ReplitFix.isReplitEnvironment(),
  apiProxyEnabled: true,  // 默认启用API代理
  projectId: ReplitFix.getCurrentProjectId()
});

// 设置全局变量，便于调试
declare global {
  interface Window {
    API_CONFIG?: ApiConfig;
    toggleApiProxy?: () => void;
  }
}

// API上下文类型
type ApiFixContextType = {
  config: ApiConfig;
  updateConfig: (newConfig: Partial<ApiConfig>) => void;
  toggleApiProxy: () => void;
};

// 创建上下文
const ApiFixContext = createContext<ApiFixContextType | null>(null);

// Provider组件
export function ApiFixProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ApiConfig>(getInitialConfig());

  // 更新配置
  const updateConfig = (newConfig: Partial<ApiConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  // 切换API代理
  const toggleApiProxy = () => {
    const newValue = !config.apiProxyEnabled;
    updateConfig({ apiProxyEnabled: newValue });
    
    // 如果在浏览器环境中，存储设置到localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('use_api_proxy', String(newValue));
    }
    
    console.log(`API代理已${newValue ? '启用' : '禁用'}`);
  };

  // 初始化时从localStorage加载配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 读取存储的API代理设置
      const useApiProxy = localStorage.getItem('use_api_proxy');
      if (useApiProxy !== null) {
        updateConfig({ apiProxyEnabled: useApiProxy === 'true' });
      }
      
      // 读取项目ID
      const projectId = ReplitFix.getCurrentProjectId();
      if (projectId !== null) {
        updateConfig({ projectId });
      }
      
      // 将配置暴露到全局变量
      window.API_CONFIG = config;
      window.toggleApiProxy = toggleApiProxy;
      
      // 输出当前配置
      console.log('API配置已初始化:', config);
    }
  }, []);

  return (
    <ApiFixContext.Provider value={{ config, updateConfig, toggleApiProxy }}>
      {children}
    </ApiFixContext.Provider>
  );
}

// 使用上下文的Hook
export function useApiConfig() {
  const context = useContext(ApiFixContext);
  if (!context) {
    throw new Error('useApiConfig must be used within an ApiFixProvider');
  }
  return context;
}

// 导出当前配置，用于直接导入场景
export const API_CONFIG = getInitialConfig();