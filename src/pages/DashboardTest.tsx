import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import axiosInstance from '@/utils/axios-config';
import PageLayout from '@/components/layout/PageLayout';

/**
 * 仪表盘数据测试页面
 * 用于测试仪表盘API数据加载是否正常
 */
const DashboardTest = () => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 测试账户摘要API
  const testAccountSummary = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试账户摘要API...' }]);
      
      const response = await axiosInstance.get('/api/dashboard/account-summary');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '账户摘要API测试成功', 
        data: {
          status: response.status,
          data: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '账户摘要API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试交易摘要API
  const testTransactionSummary = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试交易摘要API...' }]);
      
      const response = await axiosInstance.get('/api/dashboard/transaction-summary');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '交易摘要API测试成功', 
        data: {
          status: response.status,
          data: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '交易摘要API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试收入分析API
  const testIncomeAnalysis = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试收入分析API...' }]);
      
      const response = await axiosInstance.get('/api/dashboard/income-by-subject');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '收入分析API测试成功', 
        data: {
          status: response.status,
          data: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '收入分析API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试支出分析API
  const testExpenseAnalysis = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试支出分析API...' }]);
      
      const response = await axiosInstance.get('/api/dashboard/expense-by-subject');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '支出分析API测试成功', 
        data: {
          status: response.status,
          data: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '支出分析API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试部门支出分析API
  const testDepartmentExpense = async () => {
    try {
      setLoading(true);
      setResults(prev => [...prev, { type: 'info', message: '正在测试部门支出分析API...' }]);
      
      const response = await axiosInstance.get('/api/dashboard/expense-by-department');
      
      setResults(prev => [...prev, { 
        type: 'success', 
        message: '部门支出分析API测试成功', 
        data: {
          status: response.status,
          data: response.data
        }
      }]);
    } catch (error: any) {
      setResults(prev => [...prev, { 
        type: 'error', 
        message: '部门支出分析API测试失败', 
        error: error.message,
        details: error.response?.data || 'No response data'
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 测试所有仪表盘API
  const testAllDashboardApis = async () => {
    setResults(prev => [...prev, { type: 'info', message: '开始测试所有仪表盘API...' }]);
    await testAccountSummary();
    await testTransactionSummary();
    await testIncomeAnalysis();
    await testExpenseAnalysis();
    await testDepartmentExpense();
    setResults(prev => [...prev, { type: 'info', message: '所有仪表盘API测试完成' }]);
  };

  // 清除测试结果
  const clearResults = () => {
    setResults([]);
  };

  return (
    <PageLayout title="仪表盘数据测试" subtitle="测试仪表盘数据加载">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>仪表盘API测试工具</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={testAccountSummary} 
                disabled={loading}
                variant="outline"
              >
                测试账户摘要
              </Button>
              <Button 
                onClick={testTransactionSummary} 
                disabled={loading}
                variant="outline"
              >
                测试交易摘要
              </Button>
              <Button 
                onClick={testIncomeAnalysis} 
                disabled={loading}
                variant="outline"
              >
                测试收入分析
              </Button>
              <Button 
                onClick={testExpenseAnalysis} 
                disabled={loading}
                variant="outline"
              >
                测试支出分析
              </Button>
              <Button 
                onClick={testDepartmentExpense} 
                disabled={loading}
                variant="outline"
              >
                测试部门支出
              </Button>
              <Button 
                onClick={testAllDashboardApis} 
                disabled={loading}
                variant="default"
              >
                测试所有API
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

export default DashboardTest;