
import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageLayout from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import LoadMoreButton from "@/components/common/LoadMoreButton";
import { CircleAlert, ClipboardList, Clock, User, Search, Calendar, X, AlertCircle, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ActivityLog, getActivityLogs, LogsQueryParams } from "@/utils/logs-api";
import { useToast } from "@/hooks/use-toast";
import EmptyState from "@/components/common/EmptyState";

export default function ActivityLogs() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateString, setDateString] = useState("");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [visibleLogs, setVisibleLogs] = useState<ActivityLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [uniqueActions, setUniqueActions] = useState<string[]>([]);
  
  // 设置默认的分页大小
  const PAGE_SIZE = 20;

  // 从服务器获取活动日志数据
  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      
      // 构建查询参数
      const params: LogsQueryParams = {
        page,
        limit: PAGE_SIZE
      };
      
      // 添加操作类型过滤条件
      if (activeTab !== "all") {
        params.action = activeTab;
      }
      
      // 添加搜索条件
      if (searchTerm) {
        params.search = searchTerm;
      }
      
      // 添加日期过滤条件
      if (dateFilter) {
        params.dateFilter = format(dateFilter, 'yyyy-MM-dd');
      }
      
      console.log('获取活动日志，查询参数:', params);
      
      // 调用API获取数据
      const result = await getActivityLogs(params);
      
      console.log('获取到活动日志数据:', result);
      
      // 更新日志数据和分页信息
      setLogs(result.logs);
      setVisibleLogs(result.logs);
      setTotalPages(result.pagination.totalPages);
      setTotalItems(result.pagination.total);
      
      // 更新操作类型列表
      if (result.actions && Array.isArray(result.actions)) {
        // 确保所有操作类型都是字符串
        const actionTypes = result.actions.map(action => String(action));
        setUniqueActions(actionTypes);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('获取活动日志失败:', error);
      setIsError(true);
      setErrorMessage(error instanceof Error ? error.message : '无法获取活动日志数据');
      setLogs([]);
      setVisibleLogs([]);
      setIsLoading(false);
      
      toast({
        title: "获取活动日志失败",
        description: error instanceof Error ? error.message : '无法获取活动日志数据',
        variant: "destructive",
      });
    }
  };

  // 首次加载和筛选条件变化时获取数据
  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, searchTerm, dateFilter]);

  // 获取操作类型对应的图标
  const getActionIcon = (action: string) => {
    switch (action) {
      case "登录":
        return <User className="h-4 w-4 text-blue-500" />;
      case "申请付款":
        return <ClipboardList className="h-4 w-4 text-green-500" />;
      case "核对账户余额":
        return <ClipboardList className="h-4 w-4 text-amber-500" />;
      case "审批":
        return <CircleAlert className="h-4 w-4 text-purple-500" />;
      case "执行出款":
        return <ClipboardList className="h-4 w-4 text-red-500" />;
      case "修改配置":
        return <CircleAlert className="h-4 w-4 text-indigo-500" />;
      case "查看报表":
        return <ClipboardList className="h-4 w-4 text-cyan-500" />;
      case "导出数据":
        return <ClipboardList className="h-4 w-4 text-emerald-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // 处理标签页切换
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // 处理日期选择
  const handleDateSelect = (date: Date | undefined) => {
    setDateFilter(date);
    setDateString(date ? format(date, 'yyyy-MM-dd') : '');
  };

  // 处理日期输入变化
  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateString(value);
    
    if (value) {
      const parsedDate = parse(value, 'yyyy-MM-dd', new Date());
      if (isValid(parsedDate)) {
        setDateFilter(parsedDate);
      } else {
        setDateFilter(undefined);
      }
    } else {
      setDateFilter(undefined);
    }
  };

  // 清除筛选条件
  const clearFilters = () => {
    setSearchTerm("");
    setDateFilter(undefined);
    setDateString("");
  };
  
  // 检查是否有筛选条件
  const hasFilters = searchTerm !== "" || dateFilter !== undefined;

  // 不再需要NoDataDisplay组件定义，使用统一的EmptyState替代

  // 渲染移动端卡片视图
  const renderLogCard = (log: ActivityLog) => (
    <Card key={log.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {getActionIcon(log.action)}
          <span className="font-medium">{log.action}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="font-medium">时间:</div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>{log.timestamp}</span>
          </div>
          
          <div className="font-medium">用户:</div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-muted-foreground" />
            <span>{log.username}</span>
          </div>
          
          <div className="font-medium col-span-2 mt-2">详细信息:</div>
          <div className="col-span-2 text-sm text-muted-foreground border-t pt-2">
            {log.details}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // 渲染错误状态
  const ErrorDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <AlertCircle className="h-12 w-12 text-destructive opacity-70" />
        </div>
        <div className="text-lg font-medium text-destructive">
          获取数据失败
        </div>
        <p className="text-sm text-muted-foreground mt-2 mb-6">
          {errorMessage || '无法获取操作日志数据，请稍后再试'}
        </p>
        <Button variant="outline" onClick={fetchLogs} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          重新加载
        </Button>
      </div>
    </Card>
  );

  return (
    <PageLayout title="操作日志" subtitle="查看系统操作记录">
      <div className="space-y-6">
        {/* 搜索和日期筛选卡片 */}
        <Card className="p-4">
          <CardContent className="p-0 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 w-full">
                  <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder="搜索用户、操作类型或内容..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className={`flex items-center gap-2 ${isMobile ? 'w-full' : ''}`}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className={`flex justify-start text-left font-normal ${isMobile ? 'flex-1 w-full' : 'w-[240px]'}`}
                    >
                      <Calendar className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {dateFilter ? format(dateFilter, 'yyyy-MM-dd') : <span className="text-muted-foreground">选择日期...</span>}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFilter}
                      onSelect={handleDateSelect}
                      initialFocus
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>
                
                {hasFilters && (
                  <Button variant="ghost" size="icon" onClick={clearFilters} title="清除筛选条件">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* 操作类型标签页 */}
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className={`overflow-x-auto pb-2 ${isMobile ? '-mx-2 px-2' : ''}`}>
              <TabsList className={`${isMobile ? 'w-max inline-flex' : ''}`}>
                <TabsTrigger value="all">全部</TabsTrigger>
                {uniqueActions.map(action => (
                  <TabsTrigger key={action} value={action}>
                    <div className="flex items-center gap-1">
                      {getActionIcon(action)}
                      <span>{action}</span>
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            
            <TabsContent value={activeTab} className="mt-4">
              {isLoading && page === 1 ? (
                // 初始加载中状态
                <Card className="p-6">
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center space-y-4">
                      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">正在加载日志数据...</p>
                    </div>
                  </div>
                </Card>
              ) : isError ? (
                // 错误状态
                <ErrorDisplay />
              ) : logs.length === 0 ? (
                // 无数据状态
                <EmptyState 
                  title="暂无操作日志数据" 
                  description="用户操作将被记录在此并可追溯查看"
                  icon={<ClipboardList className="h-12 w-12 text-muted-foreground opacity-50" />}
                />
              ) : (
                <>
                  {isMobile ? (
                    // 移动端卡片视图
                    <div className="grid gap-4">
                      {visibleLogs.map(log => renderLogCard(log))}
                    </div>
                  ) : (
                    // PC端表格视图
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[180px]">时间</TableHead>
                              <TableHead className="w-[120px]">用户</TableHead>
                              <TableHead className="w-[140px]">操作类型</TableHead>
                              <TableHead>详细信息</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleLogs.map((log) => (
                              <TableRow key={log.id} className="hover:bg-muted/50 cursor-pointer">
                                <TableCell className="whitespace-nowrap">{log.timestamp}</TableCell>
                                <TableCell className="whitespace-nowrap">{log.username}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {getActionIcon(log.action)}
                                    <span>{log.action}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-md truncate">{log.details}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* 分页信息 */}
                  {page < totalPages && (
                    <div className="flex justify-center mt-6">
                      <div className="text-sm text-muted-foreground mb-2">
                        显示 {visibleLogs.length} 条，共 {totalItems} 条记录
                      </div>
                    </div>
                  )}
                  
                  {/* 加载更多按钮 */}
                  {page < totalPages && (
                    <div className="flex justify-center mt-2">
                      <LoadMoreButton 
                        onClick={() => setPage(prev => prev + 1)}
                        isLoading={isLoading}
                      />
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
        
        {/* 无结果时显示清除筛选按钮 */}
        {logs.length === 0 && hasFilters && !isLoading && !isError && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={clearFilters}>
              清除筛选条件
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
