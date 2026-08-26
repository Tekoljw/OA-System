import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import axiosInstance from '@/utils/axios-config';
import PageLayout from '@/components/layout/PageLayout';

/**
 * API测试页面
 * 用于测试API连接，确保可以正确访问API
 */
const ApiTest = () => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 测试API用户端点
  const testUserApi = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试用户API...' }]);
      
      const response = await axiosInstance.get('/api/user');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '用户API测试成功', 
        data: {
          status: response.status,
          user: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '用户API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试API仪表盘端点
  const testDashboardApi = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试仪表盘API...' }]);
      
      const response = await axiosInstance.get('/api/dashboard/account-summary');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '仪表盘API测试成功', 
        data: {
          status: response.status,
          summary: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '仪表盘API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试API项目端点
  const testProjectsApi = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试项目API...' }]);
      
      const response = await axiosInstance.get('/api/projects');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '项目API测试成功', 
        data: {
          status: response.status,
          projects: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '项目API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 使用直接fetch请求测试API
  const testDirectFetch = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在通过直接fetch测试API...' }]);
      
      // 获取当前项目ID
      const currentProject = localStorage.getItem('currentProject');
      let projectId = null;
      
      if (currentProject) {
        try {
          projectId = JSON.parse(currentProject).id;
        } catch (e) {}
      }
      
      // 构建完整URL (使用当前主机名和API代理端口)
      const API_PROXY_PORT = 5900;
      const baseUrl = `${window.location.protocol}//${window.location.hostname}:${API_PROXY_PORT}`;
      const url = `${baseUrl}/api/dashboard/account-summary${projectId ? `?projectId=${projectId}` : ''}`;
      
      setResults(prev => [...prev, { type: 'info', message: `请求URL: ${url}` }]);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '直接fetch测试成功', 
        data: {
          status: response.status,
          data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '直接fetch测试失败', 
        error: error.message
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 清除测试结果
  const clearResults = () => {
    setResults([]);
  };

  // 展示Axios配置信息
  const showAxiosConfig = () => {
    setResults(prev => [...prev, { 
      type: 'info', 
      message: 'Axios配置信息', 
      data: {
        baseURL: axiosInstance.defaults.baseURL,
        headers: axiosInstance.defaults.headers
      }
    }]);
  };

  return (
    <PageLayout title="API测试页面" subtitle="测试API连接是否正常工作">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>API测试工具</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={testUserApi} 
                disabled={loading}
                variant="outline"
              >
                测试用户API
              </Button>
              <Button 
                onClick={testDashboardApi} 
                disabled={loading}
                variant="outline"
              >
                测试仪表盘API
              </Button>
              <Button 
                onClick={testProjectsApi} 
                disabled={loading}
                variant="outline"
              >
                测试项目API
              </Button>
              <Button 
                onClick={testDirectFetch} 
                disabled={loading}
                variant="outline"
              >
                直接Fetch测试
              </Button>
              <Button 
                onClick={showAxiosConfig} 
                disabled={loading}
                variant="outline"
              >
                显示Axios配置
              </Button>
              <Button 
                onClick={clearResults} 
                disabled={loading}
                variant="destructive"
              >
                清除结果
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>测试结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {results.length === 0 ? (
                <div className="text-center text-gray-500">暂无测试结果</div>
              ) : (
                results.map((result, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-md ${
                      result.type === 'success' ? 'bg-green-50 border border-green-200' :
                      result.type === 'error' ? 'bg-red-50 border border-red-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}
                  >
                    <div className="font-medium">
                      {result.message}
                    </div>
                    {result.data && (
                      <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    )}
                    {result.error && (
                      <div className="mt-2 text-red-600">
                        错误: {result.error}
                        {result.details && (
                          <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
};

export default ApiTest;