
import React, { useState, useEffect } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Calendar, Search, X } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Calendar as CalendarComponent } from "../../components/ui/calendar";
import { format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import ApplicationList from "../../components/applications/ApplicationList";
import LoadMoreButton from "../../components/common/LoadMoreButton";
import { useIsMobile } from "../../hooks/use-mobile";
import { useToast } from "../../hooks/use-toast";
import { getApplications } from "../../utils/application-api";

// 定义申请类型接口
interface Application {
  id: number;
  type: string;
  title: string;
  amount: number;
  status: string;
  date: string;
  department: string;
}

// 假的部门与申请类型常量已删除：库里的部门是「财务部」等真实数据，
// 这两个数组既没被任何地方引用，内容也与实际不符，留着只会误导。

// 申请状态映射
const statusMap = {
  to_be_allocated: "待归账",
  to_be_executed: "待执行",
  completed: "已完成",
  pending: "待审批",
  rejected: "已拒绝"
};

// 生成空数据的辅助函数
const generateEmptyData = (): Application[] => {
  return [];
};

const PendingAccounting: React.FC = () => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"pending" | "completed" | "all">("pending");
  const [applications, setApplications] = useState<Record<string, Application[]>>({
    pending: [],
    completed: [],
    all: []
  });
  const [filteredApplications, setFilteredApplications] = useState<Record<string, Application[]>>({
    pending: [],
    completed: [],
    all: []
  });
  const [visibleApplications, setVisibleApplications] = useState<Record<string, Application[]>>({
    pending: [],
    completed: [],
    all: []
  });
  const [page, setPage] = useState<Record<string, number>>({
    pending: 1,
    completed: 1,
    all: 1
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateString, setDateString] = useState("");
  const PAGE_SIZE = 50;
  // 服务端返回的总数，用于判断「加载更多」还要不要显示
  const [totals, setTotals] = useState<Record<string, number>>({});

  // 获取应用列表数据
  const fetchApplications = async (status: string, pageNum: number = 1, append: boolean = false) => {
    setLoading(true);
    
    try {
      // 构建API请求URL和参数
      const apiStatus = status === "pending" ? "to_be_allocated" : 
                         status === "completed" ? "completed" : "all";
      
      console.log(`获取应用数据，状态: ${apiStatus}`);
      
      // 使用getApplications API获取数据
      // 带上分页参数：服务端一页最多 50 条，只拉第一页的话
      // 「加载更多」就只能在本地切片，后面的单据永远看不到
      // 搜索与日期交给服务端：只在本地过滤的话，搜索范围就只有已加载的那一页
      const result = await getApplications({
        type: apiStatus,
        page: pageNum,
        limit: PAGE_SIZE,
        searchTerm: searchTerm.trim() || undefined,
        date: dateFilter ? format(dateFilter, 'yyyy-MM-dd') : undefined,
      });
      
      // 创建默认的空数组
      let fetchedApps: Application[] = [];
      
      if (result && result.applications) {
        if (Array.isArray(result.applications)) {
          console.log(`获取到${result.applications.length}条应用数据`);
          
          // 使用真实数据
          fetchedApps = result.applications.map((app: any) => ({
            id: app.id,
            type: app.type || 'payment',
            // 列表要用到的字段必须完整带上：只挑几个字段的话，
            // 「申请类型」会回落成原始的 expense/income，「备注说明」「提交人」
            // 「附件」列则永远是空的 —— 而这几列在归账时正是会计要看的依据
            transactionTypeName: app.transactionTypeName,
            transactionTypeCode: app.transactionTypeCode,
            description: app.description,
            content: app.content,
            submitter: app.submitter,
            images: app.images,
            title: app.title || '未命名申请',
            amount: parseFloat(app.amount) || 0,
            status: app.status || 'pending',
            date: app.date || (app.created_at ? app.created_at.split('T')[0] : '2025-05-01'),
            department: app.department || '财务部'
          }));
        } else {
          console.error('应用数据格式不正确:', result);
          fetchedApps = generateEmptyData();
        }
      } else {
        console.error('获取应用数据失败:', result);
        fetchedApps = generateEmptyData();
      }
      
      // 记下服务端总数，用于判断还有没有下一页
      setTotals(prev => ({ ...prev, [status]: result?.total ?? fetchedApps.length }));
      setApplications(prev => ({
        ...prev,
        [status]: append ? [...(prev[status] || []), ...fetchedApps] : fetchedApps,
      }));
      
    } catch (error) {
      console.error('获取应用数据出错:', error);
      // 如果发生错误，使用空数据
      const emptyApps = generateEmptyData();
      
      if (status === "pending") {
        setApplications(prev => ({
          ...prev,
          pending: emptyApps
        }));
      } else if (status === "completed") {
        setApplications(prev => ({
          ...prev,
          completed: emptyApps
        }));
      } else if (status === "all") {
        setApplications(prev => ({
          ...prev,
          all: emptyApps
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  // 初始加载数据
  const reloadAll = () => {
    fetchApplications("pending");
    fetchApplications("completed");
    fetchApplications("all");
  };

  useEffect(() => {
    reloadAll();
  }, [toast]); // 添加toast依赖

  // 筛选应用程序
  useEffect(() => {
    const filterApplications = () => {
      const results: Record<string, Application[]> = {
        pending: [],
        completed: [],
        all: []
      };

      Object.keys(applications).forEach(key => {
        // 筛选已经在服务端完成，这里不再二次过滤
        results[key] = applications[key];
      });

      setFilteredApplications(results);
    };

    filterApplications();
  }, [applications, searchTerm, dateFilter]);

  // 筛选条件变化：页码归零并重新向服务端要第一页。
  // 页码原先跟着 applications 一起重置，「加载更多」刚追加的数据会立刻被打回第一页。
  const isFirstFilterRun = React.useRef(true);
  useEffect(() => {
    setPage({ pending: 1, completed: 1, all: 1 });
    if (isFirstFilterRun.current) {   // 首屏已由初始加载拉过，不重复请求
      isFirstFilterRun.current = false;
      return;
    }
    // 防抖：避免每敲一个字都打一次接口
    const timer = setTimeout(() => { fetchApplications(activeTab, 1, false); }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, dateFilter]);

  // 根据页码更新可见申请
  useEffect(() => {
    const tabApps = filteredApplications[activeTab] || [];
    setVisibleApplications({
      ...visibleApplications,
      [activeTab]: tabApps.slice(0, page[activeTab] * PAGE_SIZE)
    });
  }, [filteredApplications, activeTab, page]);

  /** 向服务端要下一页并追加，而不是在本地切片 */
  const handleLoadMore = async () => {
    const next = (page[activeTab] || 1) + 1;
    await fetchApplications(activeTab, next, true);
    setPage(prev => ({ ...prev, [activeTab]: next }));
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "pending" | "completed" | "all");
  };

  const handleDateSelect = (date: Date | undefined) => {
    setDateFilter(date);
    setDateString(date ? format(date, 'yyyy-MM-dd') : '');
  };

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

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "待归账";
      case "completed": return "已归账";
      case "all": return "全部";
      default: return status;
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setDateFilter(undefined);
    setDateString("");
  };

  const hasFilters = searchTerm !== "" || dateFilter !== undefined;

  return (
    <PageLayout title="待归账" subtitle="等待归账的申请记录">
      <div className="space-y-6">
        <Card className="p-4">
          <CardContent className="p-0 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 w-full">
                  <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder="搜索申请名称、部门或金额..."
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

        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className={`overflow-x-auto pb-2 ${isMobile ? '-mx-2 px-2' : ''}`}>
              <TabsList className={`${isMobile ? 'w-max inline-flex' : ''}`}>
                <TabsTrigger value="pending">待归账</TabsTrigger>
                <TabsTrigger value="completed">已归账</TabsTrigger>
                <TabsTrigger value="all">全部</TabsTrigger>
              </TabsList>
            </div>
            
            {["pending", "completed", "all"].map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4">
                <ApplicationList
                  applications={visibleApplications[tab] || []}
                  type={getStatusText(tab)}
                  // 归账后必须重新拉取，否则列表仍显示已处理的记录
                  onRefresh={reloadAll}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {activeTab && 
         ((visibleApplications[activeTab]?.length === 0 && filteredApplications[activeTab]?.length === 0) ? (
          hasFilters && (
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={clearFilters}>
                清除筛选条件
              </Button>
            </div>
          )
         ) : (
           visibleApplications[activeTab]?.length > 0 && 
           (applications[activeTab]?.length ?? 0) < (totals[activeTab] ?? 0) && (
             <div className="flex justify-center mt-6">
               <LoadMoreButton 
                 onClick={handleLoadMore}
                 isLoading={loading}
               />
             </div>
           )
         ))}
      </div>
    </PageLayout>
  );
};

export default PendingAccounting;
