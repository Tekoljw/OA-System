import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { AlertCircle, WifiOff } from 'lucide-react';

interface ApiErrorHandlerProps {
  children: React.ReactNode;
}

interface ErrorDetail {
  url: string;
  message: string;
  timestamp: string;
  requestId: string;
}

/**
 * ApiErrorHandler Component
 * 
 * 此组件负责处理API连接失败的情况并显示适当的错误消息
 * 不使用假数据，而是提供明确的错误状态
 */
const ApiErrorHandler: React.FC<ApiErrorHandlerProps> = ({ children }) => {
  const [errors, setErrors] = useState<ErrorDetail[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // 监听API连接错误
    const handleApiError = (event: CustomEvent<ErrorDetail>) => {
      const errorDetail = event.detail;
      
      // 更新错误列表
      setErrors(prev => {
        // 如果已经有相似的错误，不重复添加
        const isDuplicate = prev.some(err => err.url === errorDetail.url);
        if (isDuplicate) {
          return prev;
        }
        
        // 添加到错误列表
        return [...prev, errorDetail];
      });
      
      // 显示错误通知
      toast({
        title: "连接错误",
        description: `${errorDetail.message} (ID: ${errorDetail.requestId})`,
        variant: "destructive",
      });
    };

    // 添加事件监听器
    window.addEventListener('api-connection-error', handleApiError as EventListener);
    
    // 清理函数
    return () => {
      window.removeEventListener('api-connection-error', handleApiError as EventListener);
    };
  }, [toast]);

  // 如果没有错误，只渲染子组件
  if (errors.length === 0) {
    return <>{children}</>;
  }

  // 如果有错误，显示警告并继续渲染子组件
  return (
    <>
      {errors.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>连接问题</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            <div className="flex items-center">
              <WifiOff className="h-4 w-4 mr-2" />
              <span>系统无法连接到以下服务：</span>
            </div>
            <ul className="list-disc pl-6 text-sm mt-1">
              {errors.map((error, index) => (
                <li key={error.requestId || index}>
                  <span className="font-medium">{new URL(error.url).pathname}</span> - {error.message}
                </li>
              ))}
            </ul>
            <div className="bg-red-50 p-3 rounded-md mt-2 text-sm">
              <h4 className="font-medium mb-1">可能的解决方案：</h4>
              <ol className="list-decimal pl-5 space-y-1">
                <li>检查网络连接是否正常</li>
                <li>确保所有必要的服务已启动（ApiProxyForFrontend，DirectDBAPI等）</li>
                <li>检查系统日志以获取更多错误信息</li>
                <li>重启关键服务或刷新页面后重试</li>
              </ol>
              <p className="mt-2 text-xs italic">
                如果问题持续存在，请联系系统管理员并提供以上错误详情。
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {children}
    </>
  );
};

export default ApiErrorHandler;