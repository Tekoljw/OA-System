
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import './i18n'; // 导入i18n配置
import { LanguageProvider } from './contexts/LanguageContext';
import { ApiFixProvider } from './contexts/api-fix-context';
// 初始化Replit环境检测
import ReplitFix from './utils/replit-fix';

// 显示Replit环境检测信息
if (typeof window !== 'undefined') {
  console.log('环境检测:', {
    isReplit: ReplitFix.isReplitEnvironment(),
    host: window.location.hostname,
    protocol: window.location.protocol,
    port: window.location.port,
    path: window.location.pathname,
    apiBaseUrl: ReplitFix.getApiBaseUrl()
  });
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <LanguageProvider>
      <ApiFixProvider>
        <App />
      </ApiFixProvider>
    </LanguageProvider>
  </BrowserRouter>
);
