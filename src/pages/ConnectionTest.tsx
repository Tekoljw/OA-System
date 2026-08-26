import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import ReplitFix from '@/utils/replit-fix';
import axios from 'axios';

interface EndpointStatus {
  name: string;
  url: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  responseTime?: number;
}

/**
 * API连接测试页面
 * 此页面测试与不同API服务的连接状态，提供明确的错误信息
 * 不使用任何假数据
 */
const ConnectionTest: React.FC = () => {
  const [endpoints, setEndpoints] = useState<EndpointStatus[]>([
    { name: '身份验证服务', url: '/api/auth/check', status: 'pending', message: '正在检查连接...' },
    { name: '账户数据服务', url: '/api/accounts/check', status: 'pending', message: '正在检查连接...' },
    { name: '部门数据服务', url: '/api/departments/check', status: 'pending', message: '正在检查连接...' },
    { name: '仪表盘数据服务', url: '/api/dashboard/check', status: 'pending', message: '正在检查连接...' },
    { name: '交易数据服务', url: '/api/transactions/check', status: 'pending', message: '正在检查连接...' },
  ]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overallStatus, setOverallStatus] = useState<'success' | 'error' | 'pending'>('pending');

  // 检查API连接状态
  const checkApiConnections = async () => {
    setIsRefreshing(true);
    
    // 重置状态
    setEndpoints(prevEndpoints => 
      prevEndpoints.map(endpoint => ({
        ...endpoint,
        status: 'pending',
        message: '正在检查连接...',
        responseTime: undefined
      }))
    );
    
    // 测试所有端点
    const updatedEndpoints = await Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          const startTime = new Date().getTime();
          const url = ReplitFix.fixApiUrl(endpoint.url);
          
          // 使用超时时间较短的请求进行测试
          await axios.get(url, { timeout: 5000 });
          
          const endTime = new Date().getTime();
          const responseTime = endTime - startTime;
          
          return {
            ...endpoint,
            status: 'success' as const,
            message: '连接成功',
            responseTime
          };
        } catch (error: any) {
          let errorMessage = '连接失败';
          
          if (error.response) {
            // 服务器响应了，但返回了错误状态码
            errorMessage = `服务器返回错误: ${error.response.status} ${error.response.statusText}`;
          } else if (error.request) {
            // 请求发送了，但没有收到响应
            errorMessage = '服务器无响应，可能未启动或端口未开放';
          } else {
            // 设置请求时发生错误
            errorMessage = `请求错误: ${error.message}`;
          }
          
          return {
            ...endpoint,
            status: 'error' as const,
            message: errorMessage
          };
        }
      })
    );
    
    setEndpoints(updatedEndpoints);
    
    // 设置整体状态
    const hasErrors = updatedEndpoints.some(endpoint => endpoint.status === 'error');
    setOverallStatus(hasErrors ? 'error' : 'success');
    
    setIsRefreshing(false);
  };

  // 初始化时检查连接
  useEffect(() => {
    checkApiConnections();
  }, []);

  return (
    <div className="container max-w-4xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">系统连接状态</CardTitle>
          <CardDescription>
            测试与各种API服务的连接状态，帮助诊断系统问题
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {overallStatus === 'error' && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>连接问题</AlertTitle>
              <AlertDescription>
                部分API服务无法连接。请确保所有必需的服务都已启动并正常运行。
                查看下方详细信息了解具体问题。
              </AlertDescription>
            </Alert>
          )}
          
          {overallStatus === 'success' && (
            <Alert variant="default" className="mb-6 bg-green-50 text-green-800 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>所有服务正常</AlertTitle>
              <AlertDescription>
                所有API服务连接正常。系统可以正常工作。
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            {endpoints.map((endpoint, index) => (
              <div key={endpoint.url} className="border rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {endpoint.status === 'pending' && <Skeleton className="h-5 w-5 rounded-full" />}
                    {endpoint.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                    {endpoint.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                    <span className="font-medium">{endpoint.name}</span>
                  </div>
                  
                  <span className="text-sm text-muted-foreground">{endpoint.url}</span>
                </div>
                
                <Separator className="my-2" />
                
                <div className="text-sm mt-2">
                  {endpoint.status === 'pending' ? (
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full animate-spin" />
                      <span>正在检查连接...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <span className={endpoint.status === 'error' ? 'text-red-500' : 'text-green-600'}>
                        {endpoint.message}
                      </span>
                      
                      {endpoint.responseTime && (
                        <span className="text-xs text-muted-foreground mt-1">
                          响应时间: {endpoint.responseTime}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-between border-t pt-6">
          <div className="text-sm text-muted-foreground">
            上次检查: {new Date().toLocaleString()}
          </div>
          
          <Button onClick={checkApiConnections} disabled={isRefreshing} className="flex items-center gap-2">
            {isRefreshing && <RefreshCw className="h-4 w-4 animate-spin" />}
            {isRefreshing ? '正在检查...' : '重新检查连接'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ConnectionTest;