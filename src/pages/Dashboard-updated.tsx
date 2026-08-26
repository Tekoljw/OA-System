import React, { useState, useEffect } from "react";
import PageLayout from "../components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useAuth } from "../contexts/AuthContext";
import { ArrowDown, ArrowUp, DollarSign, PieChart, LoaderCircle, AlertCircle } from "lucide-react";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { toast } from "../hooks/use-toast";
import { API_BASE_URL } from "../utils/api-config";
import { apiRequest } from "../utils/api-fix";

// 接口定义
interface AccountSummaryData {
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  operatingCash: number;
  capitalCash: number;
  forexCash: number;
  investmentCash: number;
}

interface TransactionData {
  daily: {
    income: number;
    expense: number;
    netIncome: number;
    monthToDate: number;
    yearToDate: number;
  };
  monthly: {
    income: number;
    expense: number;
    netIncome: number;
    monthToMonthChange: number;
    yearToDateExpense: number;
  };
}

interface ChartDataItem {
  name: string;
  value: number;
}

// 默认数据（用于加载中或出错时显示）
const defaultAccountSummaryData: AccountSummaryData = {
  totalAssets: 0,
  totalLiabilities: 0,
  netAssets: 0,
  operatingCash: 0,
  capitalCash: 0,
  forexCash: 0,
  investmentCash: 0
};

const defaultTransactionData: TransactionData = {
  daily: {
    income: 0,
    expense: 0,
    netIncome: 0,
    monthToDate: 0,
    yearToDate: 0,
  },
  monthly: {
    income: 0,
    expense: 0,
    netIncome: 0,
    monthToMonthChange: 0,
    yearToDateExpense: 0,
  }
};

// 图表颜色
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#8DD1E1'];
const SECONDARY_COLORS = ['#82ca9d', '#8884d8', '#ffc658', '#ff7300', '#a4de6c'];

const Dashboard: React.FC = () => {
  const { user, currentProject } = useAuth();
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  
  // 状态管理
  const [accountSummaryData, setAccountSummaryData] = useState<AccountSummaryData>(defaultAccountSummaryData);
  const [transactionData, setTransactionData] = useState<TransactionData>(defaultTransactionData);
  const [incomeBySubject, setIncomeBySubject] = useState<ChartDataItem[]>([]);
  const [expenseBySubject, setExpenseBySubject] = useState<ChartDataItem[]>([]);
  const [expenseByDept, setExpenseByDept] = useState<ChartDataItem[]>([]);
  
  // 加载状态
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState<boolean>(true);
  const [isIncomeChartLoading, setIsIncomeChartLoading] = useState<boolean>(true);
  const [isExpenseSubjectChartLoading, setIsExpenseSubjectChartLoading] = useState<boolean>(true);
  const [isExpenseDeptChartLoading, setIsExpenseDeptChartLoading] = useState<boolean>(true);
  
  // 错误状态
  const [summaryError, setSummaryError] = useState<boolean>(false);
  const [transactionsError, setTransactionsError] = useState<boolean>(false);
  const [incomeChartError, setIncomeChartError] = useState<boolean>(false);
  const [expenseSubjectChartError, setExpenseSubjectChartError] = useState<boolean>(false);
  const [expenseDeptChartError, setExpenseDeptChartError] = useState<boolean>(false);
  
  // 格式化货币
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value);
  };
  
  // 格式化百分比
  const formatPercent = (value: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 1 }).format(value);
  };

  // 图表自定义工具提示
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-gray-200 shadow-md rounded-md">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-sm">{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };
  
  // 获取账户摘要数据
  const fetchAccountSummary = async () => {
    try {
      setSummaryError(false);
      setIsSummaryLoading(true);

      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      
      const { data: responseData } = await apiRequest('GET', `/api/dashboard/summary?projectId=${projectId}`);
      
      if (responseData.success && responseData.data) {
        setAccountSummaryData(responseData.data);
      } else {
        throw new Error('获取账户摘要数据格式不正确');
      }
    } catch (error) {
      console.error('获取账户摘要数据错误:', error);
      setSummaryError(true);
      toast({
        title: "获取账户摘要数据失败",
        description: error instanceof Error ? error.message : '未知错误',
        variant: "destructive",
      });
    } finally {
      setIsSummaryLoading(false);
    }
  };
  
  // 获取交易摘要数据
  const fetchTransactionData = async () => {
    try {
      setTransactionsError(false);
      setIsTransactionsLoading(true);

      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      
      const { data: responseData } = await apiRequest('GET', `/api/dashboard/transactions?projectId=${projectId}`);
      
      if (responseData.success && responseData.data) {
        setTransactionData(responseData.data);
      } else {
        throw new Error('获取交易摘要数据格式不正确');
      }
    } catch (error) {
      console.error('获取交易摘要数据错误:', error);
      setTransactionsError(true);
      toast({
        title: "获取交易摘要数据失败",
        description: error instanceof Error ? error.message : '未知错误',
        variant: "destructive",
      });
    } finally {
      setIsTransactionsLoading(false);
    }
  };
  
  // 获取收入分析数据
  const fetchIncomeBySubject = async () => {
    try {
      setIncomeChartError(false);
      setIsIncomeChartLoading(true);

      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      
      const { data: responseData } = await apiRequest('GET', `/api/dashboard/income-by-subject?projectId=${projectId}`);
      
      if (responseData.success && responseData.data) {
        setIncomeBySubject(responseData.data);
      } else {
        throw new Error('获取收入分析数据格式不正确');
      }
    } catch (error) {
      console.error('获取收入分析数据错误:', error);
      setIncomeChartError(true);
      // 默认值已在初始状态设置
    } finally {
      setIsIncomeChartLoading(false);
    }
  };
  
  // 获取支出主题分析数据
  const fetchExpenseBySubject = async () => {
    try {
      setExpenseSubjectChartError(false);
      setIsExpenseSubjectChartLoading(true);

      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      
      const { data: responseData } = await apiRequest('GET', `/api/dashboard/expense-by-subject?projectId=${projectId}`);
      
      if (responseData.success && responseData.data) {
        setExpenseBySubject(responseData.data);
      } else {
        throw new Error('获取支出主题分析数据格式不正确');
      }
    } catch (error) {
      console.error('获取支出主题分析数据错误:', error);
      setExpenseSubjectChartError(true);
      // 默认值已在初始状态设置
    } finally {
      setIsExpenseSubjectChartLoading(false);
    }
  };
  
  // 获取部门成本分析数据
  const fetchExpenseByDepartment = async () => {
    try {
      setExpenseDeptChartError(false);
      setIsExpenseDeptChartLoading(true);

      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      
      const { data: responseData } = await apiRequest('GET', `/api/dashboard/expense-by-department?projectId=${projectId}`);
      
      if (responseData.success && responseData.data) {
        setExpenseByDept(responseData.data);
      } else {
        throw new Error('获取部门成本分析数据格式不正确');
      }
    } catch (error) {
      console.error('获取部门成本分析数据错误:', error);
      setExpenseDeptChartError(true);
      // 默认值已在初始状态设置
    } finally {
      setIsExpenseDeptChartLoading(false);
    }
  };
  
  // 加载所有数据
  const loadAllData = () => {
    fetchAccountSummary();
    fetchTransactionData();
    fetchIncomeBySubject();
    fetchExpenseBySubject();
    fetchExpenseByDepartment();
  };
  
  // 初始加载数据
  useEffect(() => {
    loadAllData();
    
    // 自动刷新数据，每5分钟一次
    const refreshInterval = setInterval(() => {
      loadAllData();
    }, 5 * 60 * 1000); // 5分钟
    
    return () => clearInterval(refreshInterval);
  }, [currentProject?.id]);

  // 错误展示组件
  const ErrorDisplay = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
      <p className="text-sm text-destructive">{message}</p>
      <button 
        onClick={loadAllData}
        className="mt-2 text-xs bg-primary text-white px-2 py-1 rounded"
      >
        重试
      </button>
    </div>
  );

  return (
    <PageLayout title="财务仪表盘" subtitle="关键财务指标概览">
      <div className="space-y-6">
        {/* 账户摘要 */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">总资产</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <div className="flex items-center space-x-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : summaryError ? (
                <ErrorDisplay message="加载资产数据失败" />
              ) : (
                <>
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.totalAssets)}</div>
                  <div className="flex mt-1 text-xs text-muted-foreground">
                    <DollarSign className="mr-1 h-4 w-4 text-muted-foreground" />
                    <span>资产总额</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">总负债</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <div className="flex items-center space-x-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : summaryError ? (
                <ErrorDisplay message="加载负债数据失败" />
              ) : (
                <>
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.totalLiabilities)}</div>
                  <div className="flex mt-1 text-xs text-muted-foreground">
                    <ArrowDown className="mr-1 h-4 w-4 text-destructive" />
                    <span>负债总额</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">净资产</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <div className="flex items-center space-x-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : summaryError ? (
                <ErrorDisplay message="加载净资产数据失败" />
              ) : (
                <>
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.netAssets)}</div>
                  <div className="flex mt-1 text-xs text-muted-foreground">
                    <ArrowUp className="mr-1 h-4 w-4 text-emerald-500" />
                    <span>资产净值</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">运营现金</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <div className="flex items-center space-x-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : summaryError ? (
                <ErrorDisplay message="加载现金数据失败" />
              ) : (
                <>
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.operatingCash)}</div>
                  <div className="flex mt-1 text-xs text-muted-foreground">
                    <DollarSign className="mr-1 h-4 w-4 text-muted-foreground" />
                    <span>可用运营资金</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* 交易摘要 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>交易摘要</CardTitle>
              <Tabs defaultValue="daily" className="w-[200px]">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger 
                    value="daily" 
                    onClick={() => setReportType("daily")}
                  >
                    日报
                  </TabsTrigger>
                  <TabsTrigger 
                    value="monthly" 
                    onClick={() => setReportType("monthly")}
                  >
                    月报
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isTransactionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center space-y-2">
                  <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">加载交易数据中...</span>
                </div>
              </div>
            ) : transactionsError ? (
              <div className="py-8">
                <ErrorDisplay message="加载交易数据失败" />
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">收入</div>
                  <div className="text-2xl font-bold text-emerald-500 min-w-[180px]">
                    {formatCurrency(reportType === "daily" 
                      ? transactionData.daily.income 
                      : transactionData.monthly.income
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reportType === "daily" 
                      ? "今日总收入" 
                      : "本月总收入"
                    }
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">支出</div>
                  <div className="text-2xl font-bold text-destructive min-w-[180px]">
                    {formatCurrency(reportType === "daily" 
                      ? transactionData.daily.expense 
                      : transactionData.monthly.expense
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reportType === "daily" 
                      ? "今日总支出" 
                      : "本月总支出"
                    }
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">净收入</div>
                  <div className="text-2xl font-bold min-w-[180px]">
                    {formatCurrency(reportType === "daily" 
                      ? transactionData.daily.netIncome 
                      : transactionData.monthly.netIncome
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reportType === "daily" 
                      ? `月累计：${formatCurrency(transactionData.daily.monthToDate)}` 
                      : `环比：${formatPercent(transactionData.monthly.monthToMonthChange)}`
                    }
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* 分析图表 */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* 主题成本分析 */}
          <Card>
            <CardHeader>
              <CardTitle>主题成本分析</CardTitle>
            </CardHeader>
            <CardContent>
              {isExpenseSubjectChartLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="flex flex-col items-center space-y-2">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载图表数据中...</span>
                  </div>
                </div>
              ) : expenseSubjectChartError || expenseBySubject.length === 0 ? (
                <div className="flex items-center justify-center h-[300px]">
                  {expenseSubjectChartError ? (
                    <ErrorDisplay message="加载主题成本数据失败" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <p>暂无成本数据</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={expenseBySubject}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      >
                        {expenseBySubject.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* 部门成本分析 */}
          <Card>
            <CardHeader>
              <CardTitle>部门成本分析</CardTitle>
            </CardHeader>
            <CardContent>
              {isExpenseDeptChartLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="flex flex-col items-center space-y-2">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载图表数据中...</span>
                  </div>
                </div>
              ) : expenseDeptChartError || expenseByDept.length === 0 ? (
                <div className="flex items-center justify-center h-[300px]">
                  {expenseDeptChartError ? (
                    <ErrorDisplay message="加载部门成本数据失败" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <p>暂无部门成本数据</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={expenseByDept}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      >
                        {expenseByDept.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={SECONDARY_COLORS[index % SECONDARY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* 收入分析 */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>收入分析</CardTitle>
            </CardHeader>
            <CardContent>
              {isIncomeChartLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="flex flex-col items-center space-y-2">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载图表数据中...</span>
                  </div>
                </div>
              ) : incomeChartError || incomeBySubject.length === 0 ? (
                <div className="flex items-center justify-center h-[300px]">
                  {incomeChartError ? (
                    <ErrorDisplay message="加载收入分析数据失败" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <p>暂无收入数据</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={incomeBySubject}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      >
                        {incomeBySubject.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
};

export default Dashboard;