import React, { useState, useEffect } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAuth } from "../../contexts/AuthContext";
import { ArrowDown, ArrowUp, DollarSign, PieChart, LoaderCircle, AlertCircle } from "lucide-react";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { toast } from "../../hooks/use-toast";

// 接口定义
interface AccountSummaryData {
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  operatingCash: number;
  capitalCash: number;
  forexCash: number;
  investmentCash: number;
  mainCurrency?: string; // 主要货币类型，默认CNY
  forexCurrency?: string; // 外币货币类型，如USD
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

// 初始数据状态 - 将所有值初始化为0
const initialAccountSummaryData: AccountSummaryData = {
  totalAssets: 0,
  totalLiabilities: 0,
  netAssets: 0,
  operatingCash: 0,
  capitalCash: 0,
  forexCash: 0,
  investmentCash: 0,
  mainCurrency: 'CNY',
  forexCurrency: 'USD'
};

const initialTransactionData: TransactionData = {
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

const DashboardV2: React.FC = () => {
  const { user, currentProject } = useAuth();
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  
  // 账户摘要数据状态
  const [accountSummaryData, setAccountSummaryData] = useState<AccountSummaryData>(initialAccountSummaryData);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<boolean>(false);
  
  // 交易摘要数据状态
  const [transactionData, setTransactionData] = useState<TransactionData>(initialTransactionData);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState<boolean>(true);
  const [transactionsError, setTransactionsError] = useState<boolean>(false);
  
  // 收入按科目分析数据
  const [incomeBySubjectData, setIncomeBySubjectData] = useState<ChartDataItem[]>([]);
  const [isIncomeChartLoading, setIsIncomeChartLoading] = useState<boolean>(true);
  const [incomeChartError, setIncomeChartError] = useState<boolean>(false);
  
  // 支出按科目分析数据
  const [expenseBySubjectData, setExpenseBySubjectData] = useState<ChartDataItem[]>([]);
  const [isExpenseChartLoading, setIsExpenseChartLoading] = useState<boolean>(true);
  const [expenseChartError, setExpenseChartError] = useState<boolean>(false);
  
  // 支出按部门分析数据
  const [expenseByDepartmentData, setExpenseByDepartmentData] = useState<ChartDataItem[]>([]);
  const [isExpenseDeptChartLoading, setIsExpenseDeptChartLoading] = useState<boolean>(true);
  const [expenseDeptChartError, setExpenseDeptChartError] = useState<boolean>(false);
  
  // 货币选择状态 - 默认使用主币种
  const [selectedCurrency, setSelectedCurrency] = useState<string>(accountSummaryData.mainCurrency || 'CNY');
  
  // 数字格式化函数
  const formatCurrency = (value: number, currency: string = 'CNY'): string => {
    // 支持的币种：CNY(人民币), USD(美元), EUR(欧元), JPY(日元), GBP(英镑)等
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency }).format(value);
  };
  
  // 图表格式化函数，确保所有图表使用正确的货币
  const formatChartValue = (value: any): string => {
    return formatCurrency(value as number, selectedCurrency);
  };
  
  // 根据账户类型获取对应的币种
  const getCurrencyByAccountType = (accountType: string): string => {
    // 根据账户名称规则判断币种类型
    if (accountType.includes('USD') || accountType.includes('美元')) {
      return 'USD';
    } else if (accountType.includes('EUR') || accountType.includes('欧元')) {
      return 'EUR';
    } else if (accountType.includes('JPY') || accountType.includes('日元')) {
      return 'JPY';
    } else if (accountType.includes('GBP') || accountType.includes('英镑')) {
      return 'GBP';
    }
    // 默认使用人民币
    return 'CNY';
  };
  
  // 获取账户摘要数据
  const fetchAccountSummary = async () => {
    try {
      setSummaryError(false);
      setIsSummaryLoading(true);
      
      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      console.log('获取账户摘要数据, 项目ID:', projectId);
      
      // 构建API URL
      const apiBaseUrl = window.location.origin;
      const timestamp = new Date().getTime(); // 防止缓存
      const url = `${apiBaseUrl}/api/dashboard/account-summary?projectId=${projectId}&_=${timestamp}`;
      
      try {
        const response = await fetch(url);
        const responseText = await response.text();
        console.log('账户摘要API响应:', responseText);
        
        // 尝试解析JSON响应
        try {
          const responseData = JSON.parse(responseText);
          
          if (responseData.success && responseData.data) {
            console.log('设置账户摘要数据:', responseData.data);
            setAccountSummaryData(responseData.data);
            
            // 如果后端返回了主币种，更新当前选择的币种
            if (responseData.data.mainCurrency) {
              setSelectedCurrency(responseData.data.mainCurrency);
              console.log('更新当前选择币种为:', responseData.data.mainCurrency);
            }
          } else {
            // 返回格式不正确，使用默认数据
            throw new Error('获取账户摘要数据格式不正确');
          }
        } catch (parseError) {
          console.error('解析JSON响应失败:', parseError);
          // 不使用默认数据，而是显示错误状态
          setSummaryError(true);
          // 保持之前选择的币种不变
          console.error('数据格式错误，无法解析账户摘要数据');
        }
      } catch (fetchError) {
        console.error('API请求失败:', fetchError);
        // 设置错误状态
        setSummaryError(true);
      }
    } catch (error) {
      console.error('获取账户摘要数据错误:', error);
      setSummaryError(true);
      toast({
        title: "数据加载失败",
        description: "账户摘要数据加载失败，请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsSummaryLoading(false);
    }
  };
  
  // 获取交易摘要数据
  const fetchTransactionData = async () => {
    try {
      console.log('交易摘要获取前，当前状态:', JSON.stringify(transactionData));
      
      setTransactionsError(false);
      setIsTransactionsLoading(true);
      
      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      console.log('获取交易摘要数据, 项目ID:', projectId);
      
      // 构建API URL
      const apiBaseUrl = window.location.origin;
      const timestamp = new Date().getTime(); // 防止缓存
      const url = `${apiBaseUrl}/api/dashboard/transactions?projectId=${projectId}&_=${timestamp}`;
      console.log('发起API请求:', url);
      
      // 获取数据
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log('交易摘要API响应原文:', responseText);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('解析JSON响应失败:', e);
        
        // 显示错误状态
        setTransactionsError(true);
        setIsTransactionsLoading(false);
        toast({
          title: "数据解析失败",
          description: "无法解析交易摘要数据，请稍后重试",
          variant: "destructive",
        });
        return; // 提前返回，不执行后续逻辑
      }
      
      console.log('交易摘要API响应数据:', responseData);
      
      if (responseData.success && responseData.data) {
        console.log('设置交易摘要数据:', responseData.data);
        
        // 从API响应中提取数据
        const rawData = responseData.data;
        
        // 确保数据结构完整性
        const processedData = {
          daily: {
            income: rawData.daily?.income ?? 0,
            expense: rawData.daily?.expense ?? 0,
            netIncome: rawData.daily?.netIncome ?? 0,
            monthToDate: rawData.daily?.monthToDate ?? 0,
            yearToDate: rawData.daily?.yearToDate ?? 0,
          },
          monthly: {
            income: rawData.monthly?.income ?? 0,
            expense: rawData.monthly?.expense ?? 0,
            netIncome: rawData.monthly?.netIncome ?? 0,
            monthToMonthChange: rawData.monthly?.monthToMonthChange ?? 0,
            yearToDateExpense: rawData.monthly?.yearToDateExpense ?? 0,
          }
        };
        
        console.log('最终交易摘要数据:', processedData);
        setTransactionData(processedData);
        console.log('交易摘要状态更新后:', JSON.stringify(processedData));
      } else {
        throw new Error('获取交易摘要数据格式不正确: ' + JSON.stringify(responseData));
      }
    } catch (error) {
      console.error('获取交易摘要数据错误:', error);
      setTransactionsError(true);
      toast({
        title: "数据加载失败",
        description: "交易摘要数据加载失败，请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsTransactionsLoading(false);
    }
  };
  
  // 获取收入按科目分析数据
  const fetchIncomeBySubject = async () => {
    try {
      setIncomeChartError(false);
      setIsIncomeChartLoading(true);
      
      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      console.log('获取收入按科目分析数据, 项目ID:', projectId);
      
      // 构建API URL
      const apiBaseUrl = window.location.origin;
      const timestamp = new Date().getTime(); // 防止缓存
      const url = `${apiBaseUrl}/api/dashboard/income-by-subject?projectId=${projectId}&_=${timestamp}`;
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        
        const responseText = await response.text();
        
        try {
          const responseData = JSON.parse(responseText);
          
          if (responseData.success && responseData.data) {
            console.log('设置收入按科目分析数据:', responseData.data);
            setIncomeBySubjectData(responseData.data.map((item: any, index: number) => ({
              name: item.name,
              value: item.value
            })));
          } else {
            // 默认为空数据，不抛出错误
            setIncomeBySubjectData([]);
          }
        } catch (parseError) {
          console.error('解析收入按科目JSON响应失败:', parseError);
          // 默认为空数据
          setIncomeBySubjectData([]);
        }
      } catch (fetchError) {
        console.error('收入按科目API请求失败:', fetchError);
        // 默认为空数据
        setIncomeBySubjectData([]);
      }
    } catch (error) {
      console.error('获取收入按科目分析数据错误:', error);
      setIncomeChartError(true);
      // 默认为空数据
      setIncomeBySubjectData([]);
    } finally {
      setIsIncomeChartLoading(false);
    }
  };
  
  // 获取支出按科目分析数据
  const fetchExpenseBySubject = async () => {
    try {
      setExpenseChartError(false);
      setIsExpenseChartLoading(true);
      
      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      console.log('获取支出按科目分析数据, 项目ID:', projectId);
      
      // 构建API URL
      const apiBaseUrl = window.location.origin;
      const timestamp = new Date().getTime(); // 防止缓存
      const url = `${apiBaseUrl}/api/dashboard/expense-by-subject?projectId=${projectId}&_=${timestamp}`;
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        
        const responseText = await response.text();
        
        try {
          const responseData = JSON.parse(responseText);
          
          if (responseData.success && responseData.data) {
            console.log('设置支出按科目分析数据:', responseData.data);
            setExpenseBySubjectData(responseData.data.map((item: any, index: number) => ({
              name: item.name,
              value: item.value
            })));
          } else {
            // 默认为示例数据，显示至少一个条目
            setExpenseBySubjectData([
              { name: '办公经费', value: 1000 }
            ]);
          }
        } catch (parseError) {
          console.error('解析支出按科目JSON响应失败:', parseError);
          // 默认为示例数据
          setExpenseBySubjectData([
            { name: '办公经费', value: 1000 }
          ]);
        }
      } catch (fetchError) {
        console.error('支出按科目API请求失败:', fetchError);
        // 默认为示例数据
        setExpenseBySubjectData([
          { name: '办公经费', value: 1000 }
        ]);
      }
    } catch (error) {
      console.error('获取支出按科目分析数据错误:', error);
      setExpenseChartError(true);
      // 默认为示例数据
      setExpenseBySubjectData([
        { name: '办公经费', value: 1000 }
      ]);
    } finally {
      setIsExpenseChartLoading(false);
    }
  };
  
  // 获取支出按部门分析数据
  const fetchExpenseByDepartment = async () => {
    try {
      setExpenseDeptChartError(false);
      setIsExpenseDeptChartLoading(true);
      
      // 获取当前项目ID
      const projectId = currentProject?.id || 1;
      console.log('获取支出按部门分析数据, 项目ID:', projectId);
      
      // 构建API URL
      const apiBaseUrl = window.location.origin;
      const timestamp = new Date().getTime(); // 防止缓存
      const url = `${apiBaseUrl}/api/dashboard/expense-by-department?projectId=${projectId}&_=${timestamp}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.success && responseData.data) {
        console.log('设置支出按部门分析数据:', responseData.data);
        setExpenseByDepartmentData(responseData.data.map((item: any, index: number) => ({
          name: item.name,
          value: item.value
        })));
      } else {
        throw new Error('获取支出按部门分析数据格式不正确');
      }
    } catch (error) {
      console.error('获取支出按部门分析数据错误:', error);
      setExpenseDeptChartError(true);
    } finally {
      setIsExpenseDeptChartLoading(false);
    }
  };
  
  // 加载所有数据
  const loadAllData = () => {
    console.log('加载所有仪表盘数据, 当前项目:', currentProject?.id);
    fetchAccountSummary();
    fetchTransactionData();
    fetchIncomeBySubject();
    fetchExpenseBySubject();
    fetchExpenseByDepartment();
  };
  
  // 初始加载数据
  useEffect(() => {
    console.log("**** 仪表盘组件挂载或项目ID变化，重新加载所有数据 ****", currentProject?.id);
    // 延迟200ms再加载数据，确保项目切换完成
    setTimeout(() => {
      loadAllData();
    }, 200);
    
    // 自动刷新数据，每5分钟一次
    const refreshInterval = setInterval(() => {
      console.log("**** 定时刷新仪表盘数据 ****");
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
      {/* 货币切换页签 */}
      <div className="pb-4">
        <Tabs
          defaultValue={accountSummaryData.mainCurrency || "CNY"}
          value={selectedCurrency}
          onValueChange={setSelectedCurrency}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value={accountSummaryData.mainCurrency || "CNY"}>
              {accountSummaryData.mainCurrency ? `${accountSummaryData.mainCurrency === 'CNY' ? '人民币' : accountSummaryData.mainCurrency === 'USD' ? '美元' : accountSummaryData.mainCurrency === 'EUR' ? '欧元' : accountSummaryData.mainCurrency === 'JPY' ? '日元' : accountSummaryData.mainCurrency} (${accountSummaryData.mainCurrency})` : '人民币 (CNY)'}
            </TabsTrigger>
            <TabsTrigger value={accountSummaryData.forexCurrency || "USD"}>
              {accountSummaryData.forexCurrency ? `${accountSummaryData.forexCurrency === 'CNY' ? '人民币' : accountSummaryData.forexCurrency === 'USD' ? '美元' : accountSummaryData.forexCurrency === 'EUR' ? '欧元' : accountSummaryData.forexCurrency === 'JPY' ? '日元' : accountSummaryData.forexCurrency} (${accountSummaryData.forexCurrency})` : '美元 (USD)'}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      <div className="space-y-6">
        {/* 账户摘要 */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.totalAssets, selectedCurrency)}</div>
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
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.totalLiabilities, selectedCurrency)}</div>
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
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.netAssets, selectedCurrency)}</div>
                  <div className="flex mt-1 text-xs text-muted-foreground">
                    <ArrowUp className="mr-1 h-4 w-4 text-emerald-500" />
                    <span>净资产总额</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">运营资金</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <div className="flex items-center space-x-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : summaryError ? (
                <ErrorDisplay message="加载资金数据失败" />
              ) : (
                <>
                  <div className="text-2xl font-bold min-w-[180px]">{formatCurrency(accountSummaryData.operatingCash, selectedCurrency)}</div>
                  <div className="flex mt-1 text-xs text-muted-foreground">
                    <DollarSign className="mr-1 h-4 w-4 text-muted-foreground" />
                    <span>可用运营资金</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* 资金详情 */}
        <Card>
          <CardHeader>
            <CardTitle>资金详情</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {/* 投资资金 */}
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">投资资金</div>
                {isSummaryLoading ? (
                  <div className="flex items-center space-x-2">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">加载中...</span>
                  </div>
                ) : summaryError ? (
                  <div className="text-sm text-destructive">数据加载失败</div>
                ) : (
                  <>
                    <div className="text-xl font-bold">{formatCurrency(accountSummaryData.investmentCash, selectedCurrency)}</div>
                    <div className="flex mt-1 text-xs text-muted-foreground">
                      <DollarSign className="mr-1 h-3 w-3 text-muted-foreground" />
                      <span>用于投资的资金</span>
                    </div>
                  </>
                )}
              </div>

              {/* 资本资金 */}
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">资本资金</div>
                {isSummaryLoading ? (
                  <div className="flex items-center space-x-2">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">加载中...</span>
                  </div>
                ) : summaryError ? (
                  <div className="text-sm text-destructive">数据加载失败</div>
                ) : (
                  <>
                    <div className="text-xl font-bold">{formatCurrency(accountSummaryData.capitalCash, selectedCurrency)}</div>
                    <div className="flex mt-1 text-xs text-muted-foreground">
                      <DollarSign className="mr-1 h-3 w-3 text-muted-foreground" />
                      <span>资本资金</span>
                    </div>
                  </>
                )}
              </div>

              {/* 外币资金 */}
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">外币资金</div>
                {isSummaryLoading ? (
                  <div className="flex items-center space-x-2">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">加载中...</span>
                  </div>
                ) : summaryError ? (
                  <div className="text-sm text-destructive">数据加载失败</div>
                ) : (
                  <>
                    <div className="text-xl font-bold">{formatCurrency(accountSummaryData.forexCash, accountSummaryData.forexCurrency || 'USD')}</div>
                    <div className="flex mt-1 text-xs text-muted-foreground">
                      <DollarSign className="mr-1 h-3 w-3 text-muted-foreground" />
                      <span>外币资金 ({accountSummaryData.forexCurrency || 'USD'})</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
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
                      : transactionData.monthly.income,
                      selectedCurrency
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
                      : transactionData.monthly.expense,
                      selectedCurrency
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
                      : transactionData.monthly.netIncome,
                      selectedCurrency
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reportType === "daily" 
                      ? `月累计：${formatCurrency(transactionData.daily.monthToDate, selectedCurrency)}` 
                      : `环比变化：${transactionData.monthly.monthToMonthChange >= 0 ? '+' : ''}${transactionData.monthly.monthToMonthChange}%`
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reportType === "daily" 
                      ? `年累计：${formatCurrency(transactionData.daily.yearToDate, selectedCurrency)}` 
                      : `年累计支出：${formatCurrency(transactionData.monthly.yearToDateExpense, selectedCurrency)}`
                    }
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* 收支分析 */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {/* 收入按科目分析 */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>收入按科目分析</CardTitle>
            </CardHeader>
            <CardContent>
              {isIncomeChartLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center space-y-2">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载图表数据中...</span>
                  </div>
                </div>
              ) : incomeChartError ? (
                <div className="py-8">
                  <ErrorDisplay message="加载收入科目数据失败" />
                </div>
              ) : incomeBySubjectData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <PieChart className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">暂无收入数据</p>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={incomeBySubjectData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => `${entry.name}: ${formatCurrency(entry.value, selectedCurrency)}`}
                        labelLine={false}
                      >
                        {incomeBySubjectData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(value: any) => formatCurrency(value as number, selectedCurrency)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* 支出按科目分析 */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>支出按科目分析</CardTitle>
            </CardHeader>
            <CardContent>
              {isExpenseChartLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center space-y-2">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载图表数据中...</span>
                  </div>
                </div>
              ) : expenseChartError ? (
                <div className="py-8">
                  <ErrorDisplay message="加载支出科目数据失败" />
                </div>
              ) : expenseBySubjectData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <PieChart className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">暂无支出数据</p>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={expenseBySubjectData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => `${entry.name}: ${formatCurrency(entry.value, selectedCurrency)}`}
                        labelLine={false}
                      >
                        {expenseBySubjectData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={SECONDARY_COLORS[index % SECONDARY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(value: any) => formatCurrency(value as number, selectedCurrency)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* 支出按部门分析 */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>支出按部门分析</CardTitle>
            </CardHeader>
            <CardContent>
              {isExpenseDeptChartLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center space-y-2">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">加载图表数据中...</span>
                  </div>
                </div>
              ) : expenseDeptChartError ? (
                <div className="py-8">
                  <ErrorDisplay message="加载部门支出数据失败" />
                </div>
              ) : expenseByDepartmentData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <PieChart className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">暂无部门支出数据</p>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={expenseByDepartmentData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => `${entry.name}: ${formatCurrency(entry.value, selectedCurrency)}`}
                        labelLine={false}
                      >
                        {expenseByDepartmentData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(value: any) => formatCurrency(value as number, selectedCurrency)} />
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

export default DashboardV2;