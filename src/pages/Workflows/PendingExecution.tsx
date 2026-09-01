
import React, { useState, useEffect } from "react";
import { safeFormatCurrency } from "../../utils/formatter";
import { apiRequest } from "../../api/client";
import PageLayout from "../../components/layout/PageLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  Calendar, Search, X, ArrowRightLeft, CreditCard, FileText,
  Building, ArrowLeftRight, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Calendar as CalendarComponent } from "../../components/ui/calendar";
import { format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import ApplicationList from "../../components/applications/ApplicationList";
import LoadMoreButton from "../../components/common/LoadMoreButton";
import { useIsMobile } from "../../hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { useToast } from "../../hooks/use-toast";
import { getApplications } from '../../utils/application-api';
import { getTransfers } from '../../utils/transfer-api';

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

// 内部划款数据接口
interface TransferData {
  id: string;
  fromAccount: string;
  fromCurrency: string;
  amount: number;
  actualExchangeRate: number | null; // 实际汇率
  officialExchangeRate: number | null; // 官方汇率
  toAccount: string;
  toCurrency: string;
  toAmount: number; // 到账金额
  submitter: string;
  submitTime: string;
  approver: string;
  approveTime: string;
  fees: number; // 手续费
  exchangeLoss: number; // 汇损
  reason: string; // 划款事由
  status: string;
}

// 申请类型和部门常量 - 仅用于显示
const applicationTypes = ["payment", "income", "transfer", "loan", "investment"];
const departments = ["市场部", "财务部", "研发部", "人力资源部", "客服部", "行政部", "IT部"];

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

// 内部转账类型的字段映射
const transferFieldLabels = {
  fromAccount: "来源账户",
  toAccount: "目标账户",
  fromCurrency: "源币种",
  toCurrency: "目标币种",
  amount: "金额",
  toAmount: "到账金额",
  actualExchangeRate: "实际汇率",
  officialExchangeRate: "官方汇率",
  fees: "手续费",
  exchangeLoss: "汇损",
  submitter: "提交人",
  submitTime: "提交时间",
  reason: "划款事由"
};

// 生成空的转账数据的辅助函数
const generateEmptyTransferData = (): TransferData[] => {
  return [];
};

// 币种图标映射
const getCurrencyIcon = (currency: string) => {
  if (currency === "全部币种" || currency === "ALL") {
    return <ArrowLeftRight className="h-4 w-4 mr-1.5" />;
  }
  
  switch (currency) {
    case "CNY":
      return <span className="font-mono text-xs text-green-600 mr-1.5">¥</span>;
    case "USD":
      return <span className="font-mono text-xs text-blue-600 mr-1.5">$</span>;
    case "EUR":
      return <span className="font-mono text-xs text-yellow-600 mr-1.5">€</span>;
    case "JPY":
      return <span className="font-mono text-xs text-red-600 mr-1.5">¥</span>;
    case "GBP":
      return <span className="font-mono text-xs text-purple-600 mr-1.5">£</span>;
    default:
      return <CreditCard className="h-4 w-4 mr-1.5" />;
  }
};

// 获取状态样式 - 可交互版本
const getStatusStyle = (status: string) => {
  switch (status) {
    case "已完成":
      return "bg-green-100 text-green-800";
    case "已拒绝":
      return "bg-red-100 text-red-800";
    case "待执行":
      return "bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200";
    case "待审批":
      return "bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200";
    case "处理中":
      return "bg-purple-100 text-purple-800 cursor-pointer hover:bg-purple-200";
    case "未提交":
      return "bg-gray-100 text-gray-800 cursor-pointer hover:bg-gray-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

// 获取状态样式 - 非交互版本
const getStatusStyleWithoutClick = (status: string) => {
  switch (status) {
    case "已完成":
      return "bg-green-100 text-green-800";
    case "已拒绝":
      return "bg-red-100 text-red-800";
    case "待执行":
      return "bg-blue-100 text-blue-800";
    case "待审批":
      return "bg-yellow-100 text-yellow-800";
    case "处理中":
      return "bg-purple-100 text-purple-800";
    case "未提交":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

// 状态变更按钮组件
interface StatusChangeProps {
  transferId: string;
  currentStatus: string;
  onStatusChange: (id: string, newStatus: string) => void;
  pageType?: 'all' | 'pending' | 'to_be_executed'; // 页面类型：全部/待审批/待执行
}

const StatusChangeButton = ({ transferId, currentStatus, onStatusChange, pageType = 'all' }: StatusChangeProps) => {
  const [open, setOpen] = useState(false);
  
  // 根据当前状态和页面类型，确定可用的下一步状态
  const getNextStatus = () => {
    if (pageType === 'to_be_executed' && currentStatus === '待执行') {
      return [{
        value: '已完成',
        label: '标记为已完成',
        style: 'text-green-600'
      }];
    }
    else if (pageType === 'pending' && currentStatus === '待审批') {
      return [
        {
          value: '待执行',
          label: '批准并标记为待执行',
          style: 'text-orange-600'
        },
        {
          value: '已拒绝',
          label: '拒绝申请',
          style: 'text-red-600'
        }
      ];
    }
    
    return [];
  };
  
  const availableStatuses = getNextStatus();
  
  // 如果没有可用状态变更或者当前状态已经是最终状态，则只显示当前状态
  if (availableStatuses.length === 0 || currentStatus === '已完成' || currentStatus === '已拒绝') {
    return (
      <Badge className={getStatusStyleWithoutClick(currentStatus)}>
        {currentStatus}
      </Badge>
    );
  }
  
  return (
    <>
      <Badge 
        className={getStatusStyle(currentStatus)}
        onClick={() => setOpen(true)}
      >
        {currentStatus}
      </Badge>
      
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>更改划款状态</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要更改划款 {transferId} 的状态吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {availableStatuses.map((status) => (
                <Button
                  key={status.value}
                  variant="outline"
                  className={`w-full justify-start ${status.style}`}
                  onClick={() => {
                    onStatusChange(transferId, status.value);
                    setOpen(false);
                  }}
                >
                  {status.label}
                </Button>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setOpen(false)}>
              取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// 币种格式化
const formatCurrency = (amount: number, currency: string) => {
  // 检查币种代码是否是标准的3字母ISO代码
  const isValidCurrencyCode = /^[A-Z]{3}$/.test(currency);
  
  // 处理自定义或无效币种代码
  if (!isValidCurrencyCode || currency === 'TEST') {
    return `${amount.toLocaleString('zh-CN')} ${currency}`;
  }
  
  try {
    return safeFormatCurrency(amount, currency, 'zh-CN');
  } catch (error) {
    // 出错时的备用格式化方法
    return `${amount.toLocaleString('zh-CN')} ${currency}`;
  }
};

// 划款事由对话框组件
const TransferReasonDialog = ({ 
  isOpen, 
  onClose, 
  reason 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  reason: string 
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>划款事由详情</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="py-4">
          <p className="text-base">{reason}</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>
            关闭
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// 移动端划款卡片组件
const MobileTransferCard = ({ 
  transfer,
  onStatusChange
}: { 
  transfer: TransferData,
  onStatusChange?: (id: string, newStatus: string) => void
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  
  return (
    <Card className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors mb-4">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base font-medium">{transfer.id}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              {transfer.fromAccount} → {transfer.toAccount}
            </div>
          </div>
          <StatusChangeButton 
            transferId={transfer.id}
            currentStatus={transfer.status}
            onStatusChange={onStatusChange || (() => {})}
            pageType="to_be_executed"
          />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {transfer.fromCurrency} → {transfer.toCurrency}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium text-primary truncate">
              {formatCurrency(transfer.amount, transfer.fromCurrency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{transfer.submitter}</span>
          </div>
          <div 
            className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
            onClick={() => setIsReasonDialogOpen(true)}
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm truncate">{transfer.reason}</span>
          </div>
        </div>
        
        {expanded && (
          <div className="border-t pt-3 mt-3 text-sm space-y-2">
            {/* 官方汇率 */}
            <div>
              <span className="text-muted-foreground">官方汇率:</span> 
              {transfer.officialExchangeRate ? transfer.officialExchangeRate.toFixed(4) : "-"}
            </div>
            {/* 实际汇率 */}
            <div>
              <span className="text-muted-foreground">实际汇率:</span> 
              {transfer.actualExchangeRate ? transfer.actualExchangeRate.toFixed(4) : "-"}
            </div>
            {/* 到账金额 */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground flex-shrink-0">到账金额:</span> 
              <span className="truncate">{formatCurrency(transfer.toAmount || transfer.amount, transfer.toCurrency)}</span>
            </div>
            {/* 手续费 */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground flex-shrink-0">手续费:</span> 
              <span className="truncate">{formatCurrency(transfer.fees, "CNY")}</span>
            </div>
            {/* 汇损 */}
            {(transfer.exchangeLoss > 0) && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground flex-shrink-0">汇损:</span> 
                <span className="truncate text-red-500">{formatCurrency(transfer.exchangeLoss, transfer.toCurrency)}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">提交人:</span> {transfer.submitter}
            </div>
            <div>
              <span className="text-muted-foreground">提交时间:</span> {transfer.submitTime}
            </div>
            <div>
              <span className="text-muted-foreground">审批人:</span> {transfer.approver || "-"}
            </div>
            <div>
              <span className="text-muted-foreground">审批时间:</span> {transfer.approveTime || "-"}
            </div>
          </div>
        )}
        
        <div className="flex justify-center mt-2">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground flex items-center gap-1"
          >
            {expanded ? (
              <>收起详情 <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>查看详情 <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        </div>
      </CardContent>

      {/* 划款事由对话框 */}
      <TransferReasonDialog 
        isOpen={isReasonDialogOpen}
        onClose={() => setIsReasonDialogOpen(false)}
        reason={transfer.reason || ""}
      />
    </Card>
  );
};

// 内部划款表格组件
const TransferTable = ({ 
  transfers,
  onStatusChange
}: { 
  transfers: TransferData[],
  onStatusChange?: (id: string, newStatus: string) => void
}) => {
  const isMobile = useIsMobile();
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  
  if (transfers.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            <FileText className="h-12 w-12 text-muted-foreground opacity-50" />
          </div>
          <div className="text-lg font-medium text-muted-foreground">
            暂无待执行划款记录
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            当有新的待执行划款记录时，将会显示在这里
          </p>
        </div>
      </Card>
    );
  }
  
  if (isMobile) {
    return (
      <div className="space-y-2">
        {transfers.map(transfer => (
          <MobileTransferCard 
            key={transfer.id} 
            transfer={transfer}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    );
  }
  
  const showReasonDialog = (reason: string) => {
    setSelectedReason(reason);
    setReasonDialogOpen(true);
  };
  
  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>划出账户</TableHead>
                  <TableHead className="w-[80px]">币种</TableHead>
                  <TableHead className="min-w-[160px]">金额</TableHead>
                  <TableHead className="w-[90px]">官方汇率</TableHead>
                  <TableHead className="w-[90px]">实际汇率</TableHead>
                  <TableHead>划入账户</TableHead>
                  <TableHead className="w-[80px]">币种</TableHead>
                  <TableHead className="min-w-[160px]">到账金额</TableHead>
                  <TableHead className="w-[80px]">手续费</TableHead>
                  <TableHead className="w-[80px]">汇损</TableHead>
                  <TableHead className="w-[120px]">事由</TableHead>
                  <TableHead className="min-w-[80px]">提交人</TableHead>
                  <TableHead className="min-w-[120px]">提交时间</TableHead>
                  <TableHead className="w-[100px]">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{transfer.id}</TableCell>
                    <TableCell>{transfer.fromAccount}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {getCurrencyIcon(transfer.fromCurrency)}
                        {transfer.fromCurrency}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(transfer.amount, transfer.fromCurrency)}</TableCell>
                    <TableCell>{transfer.officialExchangeRate ? transfer.officialExchangeRate.toFixed(4) : "-"}</TableCell>
                    <TableCell>{transfer.actualExchangeRate ? transfer.actualExchangeRate.toFixed(4) : "-"}</TableCell>
                    <TableCell>{transfer.toAccount}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {getCurrencyIcon(transfer.toCurrency)}
                        {transfer.toCurrency}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(transfer.toAmount, transfer.toCurrency)}</TableCell>
                    <TableCell>{formatCurrency(transfer.fees, "CNY")}</TableCell>
                    <TableCell>
                      {transfer.exchangeLoss > 0 
                        ? <span className="text-red-500">{formatCurrency(transfer.exchangeLoss, transfer.toCurrency)}</span> 
                        : "-"}
                    </TableCell>
                    <TableCell 
                      onClick={() => showReasonDialog(transfer.reason)}
                      className="max-w-[100px] truncate text-blue-600 hover:underline cursor-pointer"
                    >
                      {transfer.reason}
                    </TableCell>
                    <TableCell>{transfer.submitter}</TableCell>
                    <TableCell>{transfer.submitTime}</TableCell>
                    <TableCell>
                      <StatusChangeButton 
                        transferId={transfer.id} 
                        currentStatus={transfer.status} 
                        onStatusChange={onStatusChange || (() => {})}
                        pageType="to_be_executed"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <TransferReasonDialog 
        isOpen={reasonDialogOpen}
        onClose={() => setReasonDialogOpen(false)}
        reason={selectedReason}
      />
    </>
  );
};

const PendingExecution: React.FC = () => {
  const isMobile = useIsMobile();
  // 新增主标签状态：默认展示"待执行出入金"
  const [mainTab, setMainTab] = useState<"外部付款" | "内部划款">("外部付款");
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
  const [reloadTick, setReloadTick] = useState(0);
  const [page, setPage] = useState<Record<string, number>>({
    pending: 1,
    completed: 1,
    all: 1
  });
  // 内部划款数据
  const [pendingTransfers, setPendingTransfers] = useState<TransferData[]>([]);
  // 统一使用一个加载状态
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateString, setDateString] = useState("");
  const { toast } = useToast();
  const PAGE_SIZE = 50;
  // 服务端返回的总数，用于判断「加载更多」还要不要显示
  const [totals, setTotals] = useState<Record<string, number>>({});

  /** 按状态分页拉取申请单。append 为真时追加到已有数据后面 */
  const fetchApplications = async (tab: string, pageNum: number = 1, append: boolean = false) => {
    const apiStatus = tab === 'completed' ? 'completed' : 'to_be_executed';
    try {
      setLoading(true);
      const result = await getApplications({ type: apiStatus, page: pageNum, limit: PAGE_SIZE });
      const apps = result?.applications || [];
      setTotals(prev => ({ ...prev, [tab]: result?.total ?? apps.length }));
      setApplications(prev => ({
        ...prev,
        [tab]: append ? [...(prev[tab] || []), ...apps] : apps,
        all: append ? [...(prev.all || []), ...apps] : prev.all,
      }));
    } catch (error) {
      console.error('加载申请单失败:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 加载所有数据 - 内部划款和外部付款
  useEffect(() => {
    // 状态对应关系
    const statusMapping = {
      pending: "to_be_executed", // 实际API使用的状态为to_be_executed而非UI显示的pending
      completed: "completed"      // 已完成
    };
    
    // 定义一个异步函数来加载数据
    const loadAllData = async () => {
      try {
        setLoading(true);
        
        // 1. 加载待执行申请数据
        const loadApplications = async () => {
          try {
            // 加载待执行数据
            const pendingResult = await getApplications({
              type: statusMapping.pending,
              page: 1,
              limit: PAGE_SIZE
            });
            
            // 加载已完成数据
            const completedResult = await getApplications({
              type: statusMapping.completed,
              page: 1,
              limit: PAGE_SIZE
            });

            // 总数用于判断「加载更多」还要不要显示
            setTotals({
              pending: pendingResult.total ?? (pendingResult.applications || []).length,
              completed: completedResult.total ?? (completedResult.applications || []).length,
            });
            
            // 合并所有数据
            const allApps = [...pendingResult.applications || [], ...completedResult.applications || []];
            
            // 更新数据状态
            setApplications({
              pending: pendingResult.applications || [],
              completed: completedResult.applications || [],
              all: allApps
            });
          } catch (error) {
            console.error("加载待执行申请数据失败:", error);
            // 出错时使用空数据
            setApplications({
              pending: [],
              completed: [],
              all: []
            });
          }
        };
        
        // 2. 加载内部划款数据
        const loadTransfers = async () => {
          try {
            // 获取待执行的内部划款
            const result = await getTransfers({
              status: "to_be_executed",
              limit: 30
            });
            
            if (result && result.transfers) {
              setPendingTransfers(result.transfers);
            } else {
              setPendingTransfers([]);
            }
          } catch (error) {
            console.error("加载内部划款数据失败:", error);
            setPendingTransfers([]);
          }
        };
        
        // 并行加载两种数据
        await Promise.all([
          loadApplications(),
          loadTransfers()
        ]);
        
      } catch (error) {
        console.error("加载数据失败:", error);
        toast({
          title: "加载失败",
          description: "获取待执行数据失败，请稍后重试",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadAllData();
    // reloadTick 变化即重新拉取：loadAllData 定义在 effect 内部，外部无法直接调用，
    // 用计数器作为依赖来触发刷新
  }, [toast, reloadTick]);

  // 筛选应用程序
  useEffect(() => {
    const filterApplications = () => {
      const results: Record<string, Application[]> = {
        pending: [],
        completed: [],
        all: []
      };

      Object.keys(applications).forEach(key => {
        results[key] = applications[key].filter(app => {
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
      });

      setFilteredApplications(results);
    };

    filterApplications();
  }, [applications, searchTerm, dateFilter]);

  // 页码只在筛选条件变化时归零。跟着 applications 一起重置的话，
  // 「加载更多」刚追加的数据会立刻被打回第一页，点了等于没点。
  useEffect(() => {
    setPage({ pending: 1, completed: 1, all: 1 });
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

  const handleMainTabChange = (value: string) => {
    setMainTab(value as "外部付款" | "内部划款");
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
      case "pending": return "待执行";
      case "completed": return "已执行";
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

  // 处理划款状态变更
  /**
   * 执行划款：真正落账的一步。
   *
   * 此前这里用 setTimeout 模拟网络请求，只改前端状态、把审批人写成「当前用户」——
   * 界面看着已完成，服务端分文未动，刷新就退回待执行。
   */
  const handleTransferStatusChange = async (id: string, newStatus: string) => {
    if (newStatus !== '已完成') {
      toast({ title: '不支持的操作', description: '待执行页只能执行划款', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest('PUT', `/api/transfers/${id}/execute`, {});
      if (!res?.success) throw new Error(res?.message || res?.error?.message || '执行失败');
      toast({
        title: "执行成功",
        description: `划款 ${id} 已落账，账户余额已更新`,
      });
      setReloadTick(t => t + 1);
    } catch (error: any) {
      toast({
        title: "执行失败",
        description: error?.message || '请稍后重试',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout title="待执行" subtitle="等待执行的申请记录">
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

        {/* 主标签页: 待执行出入金/待执行内部划款 */}
        <Tabs value={mainTab} onValueChange={handleMainTabChange} className="w-full">
          <div className={`overflow-x-auto pb-2 ${isMobile ? '-mx-2 px-2' : ''}`}>
            <TabsList className={`${isMobile ? 'w-max inline-flex' : ''}`}>
              <TabsTrigger value="外部付款">待执行出入金</TabsTrigger>
              <TabsTrigger value="内部划款">待执行内部划款</TabsTrigger>
            </TabsList>
          </div>
          
          {/* 出入金标签内容 */}
          <TabsContent value="外部付款" className="mt-4">
            <div className="flex items-center justify-between">
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className={`overflow-x-auto pb-2 ${isMobile ? '-mx-2 px-2' : ''}`}>
                  <TabsList className={`${isMobile ? 'w-max inline-flex' : ''}`}>
                    <TabsTrigger value="pending">待执行</TabsTrigger>
                    <TabsTrigger value="completed">已执行</TabsTrigger>
                    <TabsTrigger value="all">全部</TabsTrigger>
                  </TabsList>
                </div>
                
                {["pending", "completed", "all"].map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-4">
                    <ApplicationList
                      applications={visibleApplications[tab] || []}
                      type={getStatusText(tab)}
                      // 执行后必须重新拉取，否则列表仍显示已执行的记录
                      onRefresh={() => setReloadTick(t => t + 1)}
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
          </TabsContent>
          
          {/* 内部划款标签内容 */}
          <TabsContent value="内部划款" className="mt-4">
            <TransferTable 
              transfers={pendingTransfers} 
              onStatusChange={handleTransferStatusChange}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
};

export default PendingExecution;
