import React, { useState, useEffect, useCallback } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAuth } from "../../contexts/AuthContext";
import { 
  ArrowDown, 
  ArrowUp, 
  DollarSign, 
  PieChart, 
  BarChart,
  LineChart as LineChartIcon,
  LoaderCircle, 
  AlertCircle
} from "lucide-react";
import { 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Legend, 
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";
import { toast } from "../../hooks/use-toast";
import { useProjectContext } from "../../contexts/ProjectContext";
import axios from "axios";
import { Badge } from "../../components/ui/badge";
import { formatCurrency } from "../../utils/formatter";
import { getCurrencyTypes } from "../../utils/config-api";

// 金融摘要数据结构
interface FinancialSummaryData {
  // 本月数据
  currentMonth: {
    income: number;
    expense: number;
    netFlow: number;
  };
  // 上月数据
  previousMonth: {
    income: number;
    expense: number;
    netFlow: number;
  };
  // 累计数据
  total: {
    income: number;
    expense: number;
    assets: number;
  };
  // 币种信息
  mainCurrency?: string; // 主要货币类型，默认CNY
  forexCurrency?: string; // 外币货币类型，如USD
}

// 图表数据项
interface ChartDataItem {
  name: string;
  value: number;
}

// 时间序列数据项
interface TimeSeriesDataItem {
  date: string;
  income: number;
  expense: number;
}

// 初始财务数据 - 从数据库读取
const initialFinancialData: FinancialSummaryData = {
  currentMonth: {
    income: 0,
    expense: 0,
    netFlow: 0
  },
  previousMonth: {
    income: 0,
    expense: 0,
    netFlow: 0
  },
  total: {
    income: 0,
    expense: 0,
    assets: 0
  },
  mainCurrency: "CNY",
  forexCurrency: "USD"
};

// 默认的饼图颜色
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A569BD', '#5DADE2', '#58D68D', '#F4D03F', '#EB984E', '#EC7063'];

const NewDashboard: React.FC = () => {
  const { user } = useAuth();
  const { currentProject } = useProjectContext();
  const projectId = currentProject?.id;
  
  // 财务汇总数据
  const [financialData, setFinancialData] = useState<FinancialSummaryData>(initialFinancialData);
  const [currency, setCurrency] = useState<string>("CNY");
  
  // 饼图数据
  const [incomeBySubjectData, setIncomeBySubjectData] = useState<ChartDataItem[]>([]);
  const [expenseBySubjectData, setExpenseBySubjectData] = useState<ChartDataItem[]>([]);
  const [expenseByDepartmentData, setExpenseByDepartmentData] = useState<ChartDataItem[]>([]);
  
  // 币种列表
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(["CNY", "USD"]);
  
  // 时间序列数据
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataItem[]>([]);
  const [timeView, setTimeView] = useState<'daily' | 'monthly'>('monthly');
  
  // 使用固定的当月日期
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  // 加载状态
  const [isFinancialDataLoading, setIsFinancialDataLoading] = useState<boolean>(false);
  const [isIncomeChartLoading, setIsIncomeChartLoading] = useState<boolean>(false);
  const [isExpenseChartLoading, setIsExpenseChartLoading] = useState<boolean>(false);
  const [isExpenseByDeptLoading, setIsExpenseByDeptLoading] = useState<boolean>(false);
  const [isTimeSeriesLoading, setIsTimeSeriesLoading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 获取可用币种 - 使用内存缓存避免重复请求
  const fetchAvailableCurrencies = useCallback(async () => {
    try {
      // 直接使用默认值而不发起API请求
      console.log("使用默认币种配置");
      setAvailableCurrencies(["CNY", "USD"]);
      return;
      
      // 以下代码被注释，完全避免发起币种查询API请求
      /*
      // 检查是否已加载币种 - 使用全局标记避免重复加载
      if (currencyLoaded.current) {
        console.log("币种已加载，使用现有数据");
        return;
      }
      
      console.log("获取币种列表, 项目ID:", projectId);
      
      // 调用getCurrencyTypes获取币种配置
      const currencyTypes = await getCurrencyTypes();
      
      if (currencyTypes && Array.isArray(currencyTypes)) {
        // 从返回的币种类型中提取code字段
        const currencies = currencyTypes.map(currency => currency.code);
        console.log("从配置系统获取到的币种:", currencies);
        setAvailableCurrencies(currencies.length > 0 ? currencies : ["CNY", "USD"]);
      } else {
        console.error("解析币种列表JSON响应失败");
        setAvailableCurrencies(["CNY", "USD"]);
      }
      
      // 设置标记，避免重复请求
      currencyLoaded.current = true;
      */
    } catch (error) {
      console.error("获取币种列表失败:", error);
      setAvailableCurrencies(["CNY", "USD"]);
    }
  }, []);
  
  // 获取财务摘要数据
  const fetchFinancialSummary = useCallback(async () => {
    try {
      setIsFinancialDataLoading(true);
      
      const fromDate = firstDayOfMonth.toISOString().split('T')[0];
      const toDate = lastDayOfMonth.toISOString().split('T')[0];
      
      console.log("获取财务摘要数据, 项目ID:", projectId, "日期范围:", fromDate, "至", toDate);
      
      const response = await axios.get(`http://localhost:5000/api/dashboard-real-data.php?projectId=${projectId}&fromDate=${fromDate}&toDate=${toDate}`);
      
      if (response.data && typeof response.data === 'object') {
        setFinancialData(response.data);
        setCurrency(response.data.mainCurrency || 'CNY');
      } else {
        console.error("解析JSON响应失败:", response);
        setFinancialData(initialFinancialData);
        console.log("使用默认财务摘要数据:", initialFinancialData);
      }
    } catch (error) {
      console.error("获取财务摘要数据失败:", error);
      setFinancialData(initialFinancialData);
      console.log("使用默认财务摘要数据:", initialFinancialData);
    } finally {
      setIsFinancialDataLoading(false);
    }
  }, [projectId, firstDayOfMonth, lastDayOfMonth]);
  
  // 获取按科目分组的收入数据
  const fetchIncomeBySubject = useCallback(async () => {
    try {
      setIsIncomeChartLoading(true);
      
      console.log("获取收入按科目分析数据, 项目ID:", projectId);
      
      const response = await axios.get(`/api/dashboard/income-by-subject?projectId=${projectId}`);
      
      if (response.data && Array.isArray(response.data)) {
        setIncomeBySubjectData(response.data);
      } else {
        console.error("解析收入按科目JSON响应失败:", response);
        // 显示空数据而不是模拟数据
        setIncomeBySubjectData([]);
      }
    } catch (error) {
      console.error("获取收入按科目分析数据失败:", error);
      // 显示空数据而不是模拟数据
      setIncomeBySubjectData([]);
    } finally {
      setIsIncomeChartLoading(false);
    }
  }, [projectId]);
  
  // 获取按科目分组的支出数据
  const fetchExpenseBySubject = useCallback(async () => {
    try {
      setIsExpenseChartLoading(true);
      
      console.log("获取支出按科目分析数据, 项目ID:", projectId);
      
      const response = await axios.get(`/api/dashboard/expense-by-subject?projectId=${projectId}`);
      
      if (response.data && Array.isArray(response.data)) {
        setExpenseBySubjectData(response.data);
      } else {
        console.error("解析支出按科目JSON响应失败:", response);
        // 显示空数据而不是模拟数据
        setExpenseBySubjectData([]);
      }
    } catch (error) {
      console.error("获取支出按科目分析数据失败:", error);
      // 显示空数据而不是模拟数据
      setExpenseBySubjectData([]);
    } finally {
      setIsExpenseChartLoading(false);
    }
  }, [projectId]);
  
  // 获取按部门分组的支出数据
  const fetchExpenseByDepartment = useCallback(async () => {
    try {
      setIsExpenseByDeptLoading(true);
      
      console.log("获取支出按部门分析数据, 项目ID:", projectId);
      
      const response = await axios.get(`/api/dashboard/expense-by-department?projectId=${projectId}`);
      
      if (response.data && Array.isArray(response.data)) {
        setExpenseByDepartmentData(response.data);
      } else {
        console.error("解析支出按部门JSON响应失败:", response);
        // 显示空数据而不是模拟数据
        setExpenseByDepartmentData([]);
      }
    } catch (error) {
      console.error("获取支出按部门分析数据失败:", error);
      // 显示空数据而不是模拟数据
      setExpenseByDepartmentData([]);
    } finally {
      setIsExpenseByDeptLoading(false);
    }
  }, [projectId]);
  
  // 获取时间序列数据
  const fetchTimeSeriesData = useCallback(async () => {
    try {
      setIsTimeSeriesLoading(true);
      
      console.log("获取时间序列数据, 项目ID:", projectId, "时间视图:", timeView);
      
      const response = await axios.get(`/api/dashboard/time-series?projectId=${projectId}&view=${timeView}`);
      
      if (response.data && Array.isArray(response.data)) {
        setTimeSeriesData(response.data);
      } else {
        console.error("解析时间序列JSON响应失败:", response);
        // 显示空数据而不是模拟数据
        setTimeSeriesData([]);
      }
    } catch (error) {
      console.error("获取时间序列数据失败:", error);
      // 显示空数据而不是模拟数据
      setTimeSeriesData([]);
    } finally {
      setIsTimeSeriesLoading(false);
    }
  }, [projectId, timeView]);
  
  // 加载所有数据
  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchAvailableCurrencies(),
        fetchFinancialSummary(),
        fetchIncomeBySubject(),
        fetchExpenseBySubject(),
        fetchExpenseByDepartment(),
        fetchTimeSeriesData()
      ]);
    } catch (error) {
      console.error("加载数据失败:", error);
      toast({
        title: "加载数据失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    fetchAvailableCurrencies,
    fetchFinancialSummary,
    fetchIncomeBySubject,
    fetchExpenseBySubject,
    fetchExpenseByDepartment,
    fetchTimeSeriesData
  ]);
  
  // 使用ref防止重复加载
  const dataLoaded = React.useRef(false);
  const currencyLoaded = React.useRef(false);
  
  // 首次加载时手动设置币种数据，避免API请求循环
  useEffect(() => {
    // 设置默认币种数据
    setAvailableCurrencies(["CNY", "USD"]);
    
    // 手动设置标记，防止重复加载
    currencyLoaded.current = true;
    
    if (projectId && !dataLoaded.current) {
      console.log("Dashboard初始化加载 - 一次性加载 - 项目ID:", projectId);
      loadAllData();
      dataLoaded.current = true;
    }
  }, []);
  
  // 渲染财务摘要卡片
  const renderFinancialSummaryCard = (
    title: string, 
    amount: number, 
    previousAmount: number = 0,
    icon: React.ReactNode
  ) => {
    const change = amount - previousAmount;
    const percentChange = previousAmount !== 0 
      ? ((change / previousAmount) * 100).toFixed(1) 
      : "0.0";
    const isPositive = change >= 0;
    
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {title}
          </CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(amount, currency)}
          </div>
          {previousAmount > 0 && (
            <p className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? <ArrowUp className="inline h-4 w-4 mr-1" /> : <ArrowDown className="inline h-4 w-4 mr-1" />}
              {Math.abs(Number(percentChange))}% {isPositive ? '同比上升' : '同比下降'}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };
  
  // 渲染饼图
  const renderPieChart = (data: ChartDataItem[], loading: boolean = false, title: string = "") => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-[300px]">
          <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
    
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p>暂无{title}数据</p>
        </div>
      );
    }
    
    return (
      <ResponsiveContainer width="100%" height={300}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={true}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any) => formatCurrency(value as number, currency)}
          />
          <Legend />
        </RechartsPieChart>
      </ResponsiveContainer>
    );
  };
  
  return (
    <PageLayout>
      <div className="flex flex-col gap-5">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold tracking-tight">财务仪表盘</h2>
          
          <div className="flex items-center gap-4">
            {/* 货币切换标签页 */}
            <div className="bg-muted rounded-lg p-1">
              {availableCurrencies.map((currencyCode) => (
                <button
                  key={currencyCode}
                  className={`px-3 py-1 rounded-md text-sm font-medium ${
                    currency === currencyCode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setCurrency(currencyCode)}
                >
                  {currencyCode}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* 财务摘要卡片 */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* 本月收入 */}
              {renderFinancialSummaryCard(
                "本月收入",
                financialData.currentMonth.income,
                financialData.previousMonth.income,
                <DollarSign className="h-4 w-4 text-green-500" />
              )}
              
              {/* 本月支出 */}
              {renderFinancialSummaryCard(
                "本月支出",
                financialData.currentMonth.expense,
                financialData.previousMonth.expense,
                <DollarSign className="h-4 w-4 text-red-500" />
              )}
              
              {/* 本月净流水 */}
              {renderFinancialSummaryCard(
                "本月净流水",
                financialData.currentMonth.netFlow,
                financialData.previousMonth.netFlow,
                <DollarSign className="h-4 w-4 text-blue-500" />
              )}
              
              {/* 上月收入 */}
              {renderFinancialSummaryCard(
                "上月收入",
                financialData.previousMonth.income,
                0,
                <DollarSign className="h-4 w-4 text-green-500" />
              )}
              
              {/* 上月支出 */}
              {renderFinancialSummaryCard(
                "上月支出",
                financialData.previousMonth.expense,
                0,
                <DollarSign className="h-4 w-4 text-red-500" />
              )}
              
              {/* 上月净流水 */}
              {renderFinancialSummaryCard(
                "上月净流水",
                financialData.previousMonth.netFlow,
                0,
                <DollarSign className="h-4 w-4 text-blue-500" />
              )}
              
              {/* 项目累计收入 */}
              {renderFinancialSummaryCard(
                "项目累计收入",
                financialData.total.income,
                0,
                <LineChartIcon className="h-4 w-4 text-green-500" />
              )}
              
              {/* 项目累计支出 */}
              {renderFinancialSummaryCard(
                "项目累计支出",
                financialData.total.expense,
                0,
                <LineChartIcon className="h-4 w-4 text-red-500" />
              )}
              
              {/* 项目累计资产 */}
              {renderFinancialSummaryCard(
                "项目累计资产",
                financialData.total.assets,
                0,
                <LineChartIcon className="h-4 w-4 text-blue-500" />
              )}
            </div>
            
            {/* 收入支出曲线图 */}
            <Card className="col-span-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>收入支出曲线图</CardTitle>
                <div className="space-x-2">
                  <Badge
                    variant={timeView === 'daily' ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setTimeView('daily')}
                  >
                    日视图
                  </Badge>
                  <Badge
                    variant={timeView === 'monthly' ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setTimeView('monthly')}
                  >
                    月视图
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pl-2">
                {isTimeSeriesLoading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : timeSeriesData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <p>暂无时间序列数据</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={timeSeriesData}
                      margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatCurrency(value as number, currency)} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="income"
                        name="收入"
                        stroke="#0088FE"
                        activeDot={{ r: 8 }}
                      />
                      <Line type="monotone" dataKey="expense" name="支出" stroke="#FF8042" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            
            {/* 三个分析图表 */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* 收入分析 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">收入按科目分析</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderPieChart(incomeBySubjectData, isIncomeChartLoading, "收入")}
                </CardContent>
              </Card>
              
              {/* 支出分析（按科目） */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">支出按科目分析</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderPieChart(expenseBySubjectData, isExpenseChartLoading, "支出")}
                </CardContent>
              </Card>
              
              {/* 支出分析（按部门） */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">支出按部门分析</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderPieChart(expenseByDepartmentData, isExpenseByDeptLoading, "部门支出")}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default NewDashboard;