import React, { useState, useEffect } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  Calendar, Search, X, ArrowRightLeft, CreditCard, FileText,
  Building, ArrowLeftRight, ChevronDown, ChevronUp
} from "lucide-react";
import { useToast } from "../../hooks/use-toast";
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
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from "../../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { apiRequest } from "@/api/client";

// 定义申请类型接口
interface Application {
  id: number;
  type: string;
  title: string;
  amount: number;
  status: string;
  date: string;
  department: string;
  description?: string;
  content?: string;
  images?: string[];
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
const departments = ["市场部", "财务部", "研发部", "人力资源部", "客服部", "行政部"];

// 申请状态映射
const statusMap = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
  ready_for_execution: "待执行",
  completed: "已完成"
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
    case "待审批":
      return "bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200";
    case "处理中":
      return "bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200";
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
    case "待审批":
      return "bg-yellow-100 text-yellow-800";
    case "处理中":
      return "bg-blue-100 text-blue-800";
    case "未提交":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
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
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency
    }).format(amount);
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
  onStatusChange: (id: string, newStatus: string) => void
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
            onStatusChange={onStatusChange}
            pageType="pending"
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
          </div>
        )}
        
        <div className="flex justify-center mt-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                收起
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                展开
              </>
            )}
          </Button>
        </div>
      </CardContent>
      
      <TransferReasonDialog 
        isOpen={isReasonDialogOpen} 
        onClose={() => setIsReasonDialogOpen(false)} 
        reason={transfer.reason}
      />
    </Card>
  );
};

// 内转划款审批对话框组件
interface TransferApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transferId: string;
  transferTitle?: string;
  onApprove: (id: string, comment: string) => void;
  onReject: (id: string, comment: string) => void;
}

const TransferApprovalDialog: React.FC<TransferApprovalDialogProps> = ({
  isOpen,
  onClose,
  transferId,
  transferTitle,
  onApprove,
  onReject,
}) => {
  const [comment, setComment] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleApprove = async () => {
    try {
      setIsLoading(true);
      await onApprove(transferId, comment);
      setComment("");
      onClose();
    } catch (error) {
      console.error("审批失败", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleReject = async () => {
    try {
      setIsLoading(true);
      await onReject(transferId, comment);
      setIsRejectDialogOpen(false);
      setComment("");
      onClose();
    } catch (error) {
      console.error("拒绝失败", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>审批划款申请</DialogTitle>
            <DialogDescription>
              您正在审批划款：{transferTitle || transferId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">审批意见</label>
              <Textarea
                placeholder="请输入审批意见（可选）"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              取消
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setIsRejectDialogOpen(true)} 
              disabled={isLoading}
            >
              <X className="mr-2 h-4 w-4" />
              拒绝
            </Button>
            <Button onClick={handleApprove} disabled={isLoading}>
              <Calendar className="mr-2 h-4 w-4" />
              通过
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isRejectDialogOpen}
        onOpenChange={setIsRejectDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认拒绝</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要拒绝该划款申请吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReject();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isLoading}
            >
              确认拒绝
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// 状态变更按钮组件
interface StatusChangeProps {
  transferId: string;
  currentStatus: string;
  onStatusChange: (id: string, newStatus: string) => void;
  pageType?: 'all' | 'pending' | 'processing'; // 页面类型：全部/待审批/待执行
}

const StatusChangeButton = ({ transferId, currentStatus, onStatusChange, pageType = 'all' }: StatusChangeProps) => {
  const [open, setOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  
  // 获取下一个状态
  const getNextStatus = (status: string): string => {
    switch (status) {
      case "未提交":
        return "待审批";
      case "待审批":
        return "已完成"; // 直接变为已完成
      case "处理中":
        return "已完成";
      default:
        return status;
    }
  };
  
  // 获取确认文本
  const getConfirmText = (status: string): string => {
    switch (status) {
      case "未提交":
        return "确定要提交此划款申请吗？提交后状态将变为待审批。";
      case "待审批":
        return "确定要审批此划款申请吗？审批后状态将变为已完成。";
      case "处理中":
        return "确定要完成此划款处理吗？完成后状态将变为已完成。";
      default:
        return "确定要变更状态吗？";
    }
  };
  
  // 处理审批
  const handleApprove = async (id: string, comment: string) => {
    onStatusChange(id, "已完成");
  };
  
  // 处理拒绝
  const handleReject = async (id: string, comment: string) => {
    onStatusChange(id, "已拒绝");
  };
  
  // 首先检查页面类型
  // 如果是已完成或已拒绝状态，或者不在"待审批"/"待执行"页面中，仅显示不可点击的徽章
  const isInteractive = 
    // 只有在待审批页面中的待审批状态才可交互
    (pageType === 'pending' && currentStatus === "待审批") ||
    // 只有在待执行页面中的处理中状态才可交互
    (pageType === 'processing' && currentStatus === "处理中");
    
  // 如果状态是已完成或已拒绝，无论在哪个页面都显示为不可点击
  if (currentStatus === "已完成" || currentStatus === "已拒绝" || !isInteractive) {
    return <Badge className={getStatusStyleWithoutClick(currentStatus)}>{currentStatus}</Badge>;
  }
  
  // 对于待审批状态，打开审批对话框 (只有在待审批页面中才会执行到这里)
  if (currentStatus === "待审批") {
    return (
      <>
        <Badge 
          className={getStatusStyle(currentStatus)}
          onClick={() => setApprovalDialogOpen(true)}
        >
          {currentStatus}
        </Badge>
        
        <TransferApprovalDialog 
          isOpen={approvalDialogOpen}
          onClose={() => setApprovalDialogOpen(false)}
          transferId={transferId}
          transferTitle={`划款 ${transferId}`}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </>
    );
  }
  
  // 其他状态使用普通的确认对话框进行状态变更 (只有在待执行页面中才会执行到这里)
  const nextStatus = getNextStatus(currentStatus);
  
  return (
    <>
      <Badge 
        onClick={() => setOpen(true)}
        className={getStatusStyle(currentStatus)}
      >
        {currentStatus}
      </Badge>
      
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>状态变更确认</AlertDialogTitle>
            <AlertDialogDescription>
              {getConfirmText(currentStatus)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              onStatusChange(transferId, nextStatus);
              setOpen(false);
            }}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// 转账表格组件
const TransferTable = ({ transfers, onStatusChange }: { 
  transfers: TransferData[],
  onStatusChange: (id: string, newStatus: string) => void 
}) => {
  const isMobile = useIsMobile();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  
  const handleReasonClick = (reason: string) => {
    setSelectedReason(reason);
    setIsReasonDialogOpen(true);
  };
  
  // 如果是移动端，使用卡片布局
  if (isMobile) {
    return (
      <div className="space-y-4">
        {transfers.map((transfer) => (
          <MobileTransferCard 
            key={transfer.id} 
            transfer={transfer} 
            onStatusChange={onStatusChange}
          />
        ))}
        
        {transfers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            没有待审批的内部划款
          </div>
        )}
      </div>
    );
  }
  
  // 桌面端使用表格布局
  return (
    <>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>账户</TableHead>
            <TableHead>金额</TableHead>
            <TableHead>汇率</TableHead>
            <TableHead>到账金额</TableHead>
            <TableHead>手续费</TableHead>
            <TableHead>汇损</TableHead>
            <TableHead>划款事由</TableHead>
            <TableHead>提交人</TableHead>
            <TableHead>提交时间</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((transfer) => (
            <TableRow key={transfer.id}>
              <TableCell className="font-medium">
                {transfer.id}
              </TableCell>
              <TableCell>
                <div>
                  <span className="font-medium">
                    {getCurrencyIcon(transfer.fromCurrency)}
                    {transfer.fromAccount}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center">
                  <ArrowRightLeft className="h-3 w-3 mr-1.5" />
                  <span>
                    {getCurrencyIcon(transfer.toCurrency)}
                    {transfer.toAccount}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(transfer.amount, transfer.fromCurrency)}
              </TableCell>
              <TableCell>
                {transfer.fromCurrency !== transfer.toCurrency && (
                  <>
                    <div>
                      <span className="text-muted-foreground text-xs">官方:</span>{" "}
                      {transfer.officialExchangeRate ? transfer.officialExchangeRate.toFixed(4) : "-"}
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">实际:</span>{" "}
                      {transfer.actualExchangeRate ? transfer.actualExchangeRate.toFixed(4) : "-"}
                    </div>
                  </>
                )}
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(transfer.toAmount, transfer.toCurrency)}
              </TableCell>
              <TableCell>
                {transfer.fees > 0 ? formatCurrency(transfer.fees, "CNY") : "-"}
              </TableCell>
              <TableCell>
                {transfer.exchangeLoss > 0 ? (
                  <span className="text-red-500">
                    {formatCurrency(transfer.exchangeLoss, transfer.toCurrency)}
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell
                className="max-w-[160px] truncate cursor-pointer hover:text-blue-600"
                onClick={() => handleReasonClick(transfer.reason)}
                title="点击查看完整事由"
              >
                {transfer.reason}
              </TableCell>
              <TableCell>{transfer.submitter}</TableCell>
              <TableCell>{transfer.submitTime}</TableCell>
              <TableCell>
                <StatusChangeButton 
                  transferId={transfer.id}
                  currentStatus={transfer.status}
                  onStatusChange={onStatusChange}
                  pageType="pending"
                />
              </TableCell>
            </TableRow>
          ))}
          
          {transfers.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                没有待审批的内部划款
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      <TransferReasonDialog 
        isOpen={isReasonDialogOpen} 
        onClose={() => setIsReasonDialogOpen(false)} 
        reason={selectedReason || ""} 
      />
    </>
  );
};

// 主组件
const PendingApprovals = () => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<"外部付款" | "内部划款">("外部付款");
  const [pendingTransfers, setPendingTransfers] = useState<TransferData[]>([]);
  const [applications, setApplications] = useState<Record<string, Application[]>>({
    pending: [],
    approved: [],
    rejected: [],
    all: []
  });
  const [filteredApplications, setFilteredApplications] = useState<Record<string, Application[]>>({
    pending: [],
    approved: [],
    rejected: [],
    all: []
  });
  const [visibleApplications, setVisibleApplications] = useState<Record<string, Application[]>>({
    pending: [],
    approved: [],
    rejected: [],
    all: []
  });
  const [page, setPage] = useState<Record<string, number>>({
    pending: 1,
    approved: 1,
    rejected: 1,
    all: 1
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateString, setDateString] = useState("");
  const PAGE_SIZE = 50;

  // 获取应用列表数据
  const fetchApplications = async (status: string) => {
    setLoading(true);
    
    try {
      // 构建API请求URL和参数
      const apiStatus = status === "pending" ? "pending" : 
                        status === "approved" ? "approved" : 
                        status === "rejected" ? "rejected" : "all";
      
      console.log(`获取应用数据，状态: ${apiStatus}`);
      
      const response = { data: await apiRequest('GET', `/api/applications?status=${apiStatus}`) };
      
      // 创建默认的空数组
      let fetchedApps: Application[] = [];
      
      if (response.data && response.data.success) {
        // 检查数据返回格式 - 兼容两种格式
        const applications = response.data.applications || 
                            (response.data.data && response.data.data.applications);
        
        if (applications && Array.isArray(applications)) {
          console.log(`获取到${applications.length}条应用数据`);
          
          // 使用真实数据
          fetchedApps = applications.map((app: any) => ({
            id: app.id,
            type: app.type || 'payment',
            title: app.title || '未命名申请',
            amount: parseFloat(app.amount) || 0,
            status: app.status || 'pending',
            date: app.date || (app.created_at ? app.created_at.split('T')[0] : '2025-05-01'),
            department: app.department || '财务部',
            description: app.description || app.content || '',
            content: app.content || '',
            images: app.images || []
          }));
        } else {
          console.error('应用数据格式不正确 - 未找到数组:', response.data);
          // 如果数据格式不正确，使用空数据
          fetchedApps = generateEmptyData();
        }
      } else {
        console.error('获取应用数据失败:', response.data);
        // 如果API请求失败，使用空数据
        fetchedApps = generateEmptyData();
      }
      
      // 更新状态
      updateApplicationState(status, fetchedApps);
      
    } catch (error) {
      console.error('获取应用数据出错:', error);
      // 如果发生错误，使用空数据
      const emptyApps = generateEmptyData();
      updateApplicationState(status, emptyApps);
    } finally {
      setLoading(false);
    }
  };

  // 生成空数据的辅助函数
  const generateEmptyData = (): Application[] => {
    return [];
  };

  // 更新应用状态的辅助函数
  const updateApplicationState = (status: string, apps: Application[]) => {
    setApplications(prev => ({
      ...prev,
      [status]: apps
    }));
  };

  // 初始加载数据
  useEffect(() => {
    const loadInitialData = async () => {
      // 只加载待审批状态的数据
      await fetchApplications("pending");
    };
    
    loadInitialData();
  }, []);

  // 筛选应用程序
  useEffect(() => {
    const filterApplications = () => {
      const results: Record<string, Application[]> = {
        pending: [],
        approved: [],
        rejected: [],
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
      // 重置页码
      setPage({
        pending: 1,
        approved: 1,
        rejected: 1,
        all: 1
      });
    };

    filterApplications();
  }, [applications, searchTerm, dateFilter]);

  // 根据页码更新可见申请
  useEffect(() => {
    const pendingApps = filteredApplications['pending'] || [];
    setVisibleApplications({
      ...visibleApplications,
      'pending': pendingApps.slice(0, page['pending'] * PAGE_SIZE)
    });
  }, [filteredApplications, page]);

  const handleLoadMore = () => {
    setLoading(true);
    
    // 模拟网络请求延迟
    setTimeout(() => {
      setPage(prev => ({
        ...prev,
        'pending': prev['pending'] + 1
      }));
      setLoading(false);
    }, 500);
  };

  const handleMainTabChange = (value: string) => {
    setMainTab(value as "外部付款" | "内部划款");
  };
  
  // 处理划款状态变更
  const handleTransferStatusChange = (id: string, newStatus: string) => {
    // 在实际项目中，这里应该调用API更新状态
    // 例如：api.updateTransferStatus(id, newStatus);
    
    // 状态变更提示信息
    let successMessage = "";
    switch (newStatus) {
      case "已完成":
        successMessage = `划款 ${id} 已审批通过并完成`;
        break;
      case "已拒绝":
        successMessage = `划款 ${id} 已被拒绝`;
        break;
      default:
        successMessage = `划款 ${id} 状态已更新为 ${newStatus}`;
    }
    
    console.log(successMessage);
    
    // 更新本地状态数据
    setPendingTransfers(prev => 
      prev.map(transfer => 
        transfer.id === id 
          ? { ...transfer, status: newStatus } 
          : transfer
      )
    );
    
    // 显示成功消息
    toast({
      title: "状态已更新",
      description: successMessage,
      variant: newStatus === "已拒绝" ? "destructive" : "default",
    });
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
      case "pending": return "待审批";
      case "approved": return "已批准";
      case "rejected": return "已拒绝";
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
    <PageLayout title="待审批" subtitle="等待审批的申请记录">
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

        {/* 主标签页: 待审批出入金/待审批内部划款 */}
        <Tabs value={mainTab} onValueChange={handleMainTabChange} className="w-full">
          <div className={`overflow-x-auto pb-2 ${isMobile ? '-mx-2 px-2' : ''}`}>
            <TabsList className={`${isMobile ? 'w-max inline-flex' : ''}`}>
              <TabsTrigger value="外部付款">待审批出入金</TabsTrigger>
              <TabsTrigger value="内部划款">待审批内部划款</TabsTrigger>
            </TabsList>
          </div>
          
          {/* 出入金标签内容 */}
          <TabsContent value="外部付款" className="mt-4">
            <ApplicationList 
              applications={visibleApplications['pending'] || []}
              type="待审批"
              onRefresh={() => {
                // 刷新页面数据
                fetchApplications('pending');
              }}
            />

            {(visibleApplications['pending']?.length === 0 && filteredApplications['pending']?.length === 0) ? (
              hasFilters && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={clearFilters}>
                    清除筛选条件
                  </Button>
                </div>
              )
            ) : (
              visibleApplications['pending']?.length > 0 && 
              visibleApplications['pending']?.length < filteredApplications['pending']?.length && (
                <div className="flex justify-center mt-6">
                  <LoadMoreButton 
                    onClick={handleLoadMore}
                    isLoading={loading}
                  />
                </div>
              )
            )}
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

export default PendingApprovals;