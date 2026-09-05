import React, { useState, useEffect } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { PlusCircle, File, CreditCard, FilePlus, ArrowDownUp, BadgeDollarSign, Calendar, Search, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Calendar as CalendarComponent } from "../../components/ui/calendar";
import { format, isValid, parse } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { zhCN } from "date-fns/locale";
import { ApplicationDialog } from "../../components/applications/ApplicationDialog";
import ApplicationList from "../../components/applications/ApplicationList";
import LoadMoreButton from "../../components/common/LoadMoreButton";
import { useIsMobile } from "../../hooks/use-mobile";
import { 
  getAllTransactionTypes, 
  getIncomeTypes, 
  getExpenseTypes,
  TransactionType 
} from "../../utils/config-api";
import { 
  getApplications,
  createApplication,
  Application as ApiApplication 
} from "../../utils/application-api";

// 定义申请类型接口
interface Application {
  id: number;
  type: string;
  title: string;
  amount: number;
  status: string;
  date: string;
  department: string;
  submitter?: string; // 申请提交人
  images?: string[]; // 附件图片数组
}

// 定义流水类型映射，用于标准化名称
interface TransactionTypeMapping {
  [key: string]: string;
}

const transactionTypeMapping: TransactionTypeMapping = {
  "收入": "income",
  "出售资产": "asset_sale",
  "借入": "borrow_in",
  "支出": "payment",
  "采购资产": "asset_purchase",
  "借出": "borrow_out"
};

// 仅定义应用类型
const applicationTypes = ["payment", "income", "transfer", "loan", "investment"];

const MyApplications: React.FC = () => {
  const isMobile = useIsMobile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  // 添加预设申请类型状态
  const [presetType, setPresetType] = useState<'payment' | 'income' | undefined>(undefined);
  const { user } = useAuth(); // 提交人必须取自登录身份，不能写死
  
  // 使用状态保存从数据库加载的流水类型
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  
  // 动态保存应用程序记录的状态
  const [allApplications, setAllApplications] = useState<Record<string, Application[]>>({
    all: []
  });
  const [visibleApplications, setVisibleApplications] = useState<Record<string, Application[]>>({
    all: []
  });
  const [page, setPage] = useState<Record<string, number>>({
    all: 1
  });
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true); // 添加初始加载状态
  const [error, setError] = useState<string | null>(null); // 添加错误状态
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateString, setDateString] = useState("");
  const [filteredApplications, setFilteredApplications] = useState<Record<string, Application[]>>({
    all: []
  });
  const PAGE_SIZE = 50;
  
  // 从数据库加载流水类型
  useEffect(() => {
    const fetchTransactionTypes = async () => {
      try {
        setLoadingTypes(true);
        
        // 获取所有流水类型
        const allTypes = await getAllTransactionTypes();
        
        console.log("从数据库加载的流水类型:", allTypes);
        setTransactionTypes(allTypes);
        
        // 更新状态对象，添加新的流水类型
        let newAppsRecord: Record<string, Application[]> = { all: [] };
        let newPageRecord: Record<string, number> = { all: 1 };
        let newVisibleRecord: Record<string, Application[]> = { all: [] };
        let newFilteredRecord: Record<string, Application[]> = { all: [] };
        
        // 为每个流水类型添加记录
        allTypes.forEach(type => {
          const mappedType = transactionTypeMapping[type.name] || type.name.toLowerCase().replace(/\s+/g, '_');
          newAppsRecord[mappedType] = [];
          newPageRecord[mappedType] = 1;
          newVisibleRecord[mappedType] = [];
          newFilteredRecord[mappedType] = [];
        });
        
        // 设置状态
        setAllApplications(newAppsRecord);
        setPage(newPageRecord);
        setVisibleApplications(newVisibleRecord);
        setFilteredApplications(newFilteredRecord);
        
        // 加载完成
        setLoadingTypes(false);
      } catch (error) {
        console.error("加载流水类型失败:", error);
        setLoadingTypes(false);
      }
    };
    
    fetchTransactionTypes();
  }, []);

  // 从API获取申请数据 - 根据流水类型分类
  useEffect(() => {
    // 只有在流水类型加载完成后才执行此操作
    if (!loadingTypes && transactionTypes.length > 0) {
      const fetchApplicationsData = async () => {
        try {
          setLoading(true);
          console.log("从API获取申请数据");
          
          // 获取所有申请
          const result = await getApplications({
            type: 'all',
            page: 1,
            limit: 100, // 获取足够多的记录以便分类
            mine: true, // 本页是「我的申请」，只看自己提交的
          });
          
          // 将API返回的应用数据转换为前端应用格式
          const apiApps = result.applications.map(app => ({
            id: app.id,
            type: app.type,
            // 列表的「申请类型」列读的是 transactionTypeName（如「股东分红」），
            // 这里只挑字段不带上它，前端就回落到 getTypeText(app.type)，
            // 而它的 switch 里没有 expense/income 分支，于是原样显示成「expense」。
            // description / content 同理 —— 不带上，「备注说明」列永远是空的。
            transactionTypeName: (app as any).transactionTypeName,
            transactionTypeCode: (app as any).transactionTypeCode,
            description: (app as any).description,
            content: (app as any).content,
            title: app.title,
            amount: app.amount,
            status: app.status,
            date: app.date,
            department: app.department,
            submitter: app.submitter,
            images: app.images // 保留图片数据，如果API返回了的话
          }));
          
          console.log("API返回的申请数据:", apiApps);
          
          // 创建新的应用程序记录
          let newApplications: Record<string, Application[]> = {
            all: apiApps
          };
          
          // 为每个流水类型创建对应的申请列表
          transactionTypes.forEach(type => {
            const mappedType = transactionTypeMapping[type.name] || type.name.toLowerCase().replace(/\s+/g, '_');
            
            // 根据流水类型的类别(income/expense)找到对应的申请
            let matchedApps: Application[] = [];
            
            if (type.type === 'income') {
              // 收入类型匹配 (主要是判断类型名称)
              matchedApps = apiApps.filter(app => 
                app.type === "income" || 
                app.title.toLowerCase().includes("收入") || 
                app.title.toLowerCase().includes("销售")
              );
            } else if (type.type === 'expense') {
              // 支出类型匹配
              matchedApps = apiApps.filter(app => 
                app.type === "payment" || 
                app.title.toLowerCase().includes("费用") || 
                app.title.toLowerCase().includes("采购")
              );
            }
            
            newApplications[mappedType] = matchedApps;
          });
          
          console.log("分类后的申请数据:", newApplications);
          setAllApplications(newApplications);
          setLoading(false);
        } catch (error) {
          console.error("获取申请数据失败:", error);
          // 出错时使用初始数据
          setAllApplications({ all: [] });
          setLoading(false);
        }
      };
      
      fetchApplicationsData();
    }
  }, [loadingTypes, transactionTypes]);

  // 筛选应用程序
  useEffect(() => {
    const filterApplications = () => {
      // 创建空结果集，包含所有已知的页签类型
      const results: Record<string, Application[]> = { all: [] };
      
      // 为每个存在于allApplications中的键创建一个空数组
      Object.keys(allApplications).forEach(key => {
        results[key] = [];
      });

      // 为每个类型筛选符合条件的申请
      Object.keys(allApplications).forEach(key => {
        if (allApplications[key] && Array.isArray(allApplications[key])) {
          results[key] = allApplications[key].filter(app => {
            // 文本搜索匹配
            const textMatch = searchTerm === "" || 
              app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
              app.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
              `${app.amount}`.includes(searchTerm);
            
            // 日期过滤匹配
            let dateMatch = true;
            if (dateFilter) {
              const appDate = parse(app.date, 'yyyy-MM-dd', new Date());
              const filterDate = dateFilter;
              dateMatch = appDate.getFullYear() === filterDate.getFullYear() &&
                          appDate.getMonth() === filterDate.getMonth() &&
                          appDate.getDate() === filterDate.getDate();
            }
            
            return textMatch && dateMatch;
          });
        }
      });

      setFilteredApplications(results);
      
      // 重置页码 - 为所有页签创建页码记录
      const newPageRecord: Record<string, number> = {};
      Object.keys(results).forEach(key => {
        newPageRecord[key] = 1;
      });
      setPage(newPageRecord);
    };

    filterApplications();
  }, [allApplications, searchTerm, dateFilter]);

  // 根据页码更新可见申请
  useEffect(() => {
    const tabApps = filteredApplications[activeTab] || [];
    setVisibleApplications(prev => ({
      ...prev,
      [activeTab]: tabApps.slice(0, page[activeTab] * PAGE_SIZE)
    }));
  }, [filteredApplications, activeTab, page]);

  const handleLoadMore = async () => {
    try {
      setLoading(true);
      
      // 增加页码
      const nextPage = page[activeTab] + 1;
      
      // 直接从API获取更多数据
      if (activeTab === 'all') {
        // 获取所有申请，使用当前筛选条件和下一页
        const result = await getApplications({
          type: 'all',
          page: nextPage,
          limit: PAGE_SIZE,
          mine: true,
          searchTerm,
          date: dateFilter ? format(dateFilter, 'yyyy-MM-dd') : undefined
        });
        
        // 将新获取的应用添加到现有列表中
        const newApps = result.applications.map(app => ({
          id: app.id,
          type: app.type,
          // 与首屏加载保持同一套字段，漏掉的话翻页之后的行会缺列
          transactionTypeName: (app as any).transactionTypeName,
          transactionTypeCode: (app as any).transactionTypeCode,
          description: (app as any).description,
          content: (app as any).content,
          title: app.title,
          amount: app.amount,
          status: app.status,
          date: app.date,
          department: app.department,
          submitter: app.submitter,
          images: app.images
        }));
        
        // 更新页码和应用程序列表
        setPage(prev => ({
          ...prev,
          [activeTab]: nextPage
        }));
        
        // 将新的应用程序添加到当前已加载的应用程序列表中
        setAllApplications(prev => ({
          ...prev,
          all: [...prev.all, ...newApps]
        }));
      } else {
        // 如果是特定类型的标签，仍然使用翻页逻辑
        setPage(prev => ({
          ...prev,
          [activeTab]: nextPage
        }));
      }
    } catch (error) {
      console.error("加载更多申请失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  const handleApplicationCreate = async (data: any): Promise<void> => {
    console.log("创建新申请:", data);

    // 准备API请求数据
    // 三处此前都是错的：userId 写死为 1（提交人会记成管理员）、
    // department 传的是部门名而后端要 departmentId、
    // type 传 'payment' 而后端只认 income / expense。
    const num = (v: any) => (v !== undefined && v !== null && v !== '' ? Number(v) : undefined);
    const requestData = {
      // 收支方向以弹窗里选的一级类型为准，不再靠 presetType 猜
      type: data.direction || (presetType === 'income' ? 'income' : 'expense'),
      title: data.title,
      amount: parseFloat(data.amount),
      departmentId: data.department ? Number(data.department) : undefined,
      userId: user?.id,
      images: data.images || [], // 确保传递图片数据
      content: data.description || '', // 添加内容/描述字段
      description: data.description || '', // 备注说明
      relatedParty: data.relatedParty, // 供应商/客户信息
      dueDate: data.dueDate, // 期限日期
      // 一级类型与二级选项：后端据此校验并在归账执行后衍生资产/借贷/股东记录
      transaction_type_code: data.transactionTypeCode,
      subject_id:       num(data.subjectId),
      loan_type_code:   data.loanTypeCode || undefined,
      related_loan_id:  num(data.relatedLoanId),
      related_asset_id: num(data.relatedAssetId),
      asset_type_id:    num(data.assetTypeId),
      shareholder_id:   num(data.shareholderId),
      quantity:         num(data.quantity),
    };
    
    console.log("准备提交申请数据:", requestData);
    
    // 调用API创建申请
    const newApplication = await createApplication(requestData);
    console.log("申请创建成功:", newApplication);
    
    // 将新创建的申请添加到列表中
    const formattedApp: Application = {
      id: newApplication.id,
      type: newApplication.type,
      title: newApplication.title,
      amount: newApplication.amount,
      status: newApplication.status,
      date: newApplication.date || new Date().toISOString().split('T')[0],
      department: newApplication.department,
      submitter: newApplication.submitter
    };
    
    // 更新申请列表状态
    setAllApplications(prev => {
      // 更新所有申请和特定类型的申请
      const newState = { ...prev };
      
      // 添加到"全部"类型
      newState.all = [formattedApp, ...(newState.all || [])];
      
      // 如果有对应的类型分类，也添加到对应的类型
      const appType = transactionTypeMapping[formattedApp.type] || formattedApp.type;
      if (newState[appType]) {
        newState[appType] = [formattedApp, ...newState[appType]];
      }
      
      return newState;
    });
    
    // 对话框由子组件自行关闭，创建成功后返回
    return Promise.resolve();
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
  
  const clearFilters = () => {
    setSearchTerm("");
    setDateFilter(undefined);
    setDateString("");
  };
  
  const hasFilters = searchTerm !== "" || dateFilter !== undefined;

  return (
    <PageLayout title="我的申请" subtitle="管理您提交的所有申请记录">
      <div className="space-y-6">
        {/* 添加搜索和筛选卡片 */}
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
          {loadingTypes ? (
            <div className="w-full flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span>加载流水类型...</span>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <div className="pb-2">
                <TabsList className="flex flex-wrap h-auto rounded-md bg-muted p-1 w-full justify-start">
                  {/* 始终显示"全部"页签 */}
                  <TabsTrigger 
                    key="all" 
                    value="all" 
                    className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                  >
                    <File className="h-4 w-4 mr-1.5" />
                    全部申请
                  </TabsTrigger>
                  
                  {/* 从数据库中加载的流水类型 */}
                  {transactionTypes.map((type) => {
                    const mappedType = transactionTypeMapping[type.name] || type.name.toLowerCase().replace(/\s+/g, '_');
                    // 默认图标
                    let icon = <CreditCard className="h-4 w-4 mr-1.5" />;
                    
                    // 根据流水类型设置图标
                    if (type.type === 'income') {
                      icon = <FilePlus className="h-4 w-4 mr-1.5" />;
                    } else if (type.type === 'expense') {
                      icon = <CreditCard className="h-4 w-4 mr-1.5" />;
                    }
                    
                    return (
                      <TabsTrigger 
                        key={mappedType} 
                        value={mappedType} 
                        className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                      >
                        {icon}
                        {type.name}申请
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {/* 下边框 */}
                <div className="h-[1px] bg-border w-full mt-1"></div>
              </div>
              
              <div className="mt-2 flex flex-wrap gap-2 justify-start">
                <Button 
                  onClick={() => {
                    setPresetType('payment');
                    setIsDialogOpen(true);
                  }} 
                  className="gap-1"
                >
                  <CreditCard className="h-4 w-4" />
                  申请付款
                </Button>
                <Button 
                  onClick={() => {
                    setPresetType('income');
                    setIsDialogOpen(true);
                  }} 
                  className="gap-1"
                >
                  <BadgeDollarSign className="h-4 w-4" />
                  申请收款
                </Button>
              </div>
              
              {/* 全部申请内容 */}
              <TabsContent key="all" value="all" className="mt-4">
                <ApplicationList 
                  applications={visibleApplications["all"] || []}
                  type="全部申请" 
                />
              </TabsContent>
              
              {/* 动态生成的内容页签 */}
              {transactionTypes.map((type) => {
                const mappedType = transactionTypeMapping[type.name] || type.name.toLowerCase().replace(/\s+/g, '_');
                return (
                  <TabsContent key={mappedType} value={mappedType} className="mt-4">
                    <ApplicationList 
                      applications={visibleApplications[mappedType] || []}
                      type={`${type.name}申请`}
                    />
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
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
           visibleApplications[activeTab]?.length < filteredApplications[activeTab]?.length && (
             <div className="flex justify-center mt-6">
               <LoadMoreButton 
                 onClick={handleLoadMore}
                 isLoading={loading}
               />
             </div>
           )
         ))}
      </div>

      <ApplicationDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setPresetType(undefined);
        }}
        onSubmit={handleApplicationCreate}
        presetType={presetType}
      />
    </PageLayout>
  );
};

export default MyApplications;