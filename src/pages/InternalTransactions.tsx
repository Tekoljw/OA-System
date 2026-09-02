import React, { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRightLeft, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Calendar,
  X, 
  CreditCard, 
  Building,
  FileText,
  ArrowLeftRight,
  CornerRightDown,
  RefreshCw,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import PageLayout from "@/components/layout/PageLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import LoadMoreButton from "@/components/common/LoadMoreButton";
import { getCurrencyTypes } from "@/utils/config-api";
import { apiRequest } from "@/api/client";

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

// 使用空数组作为初始值，将从API获取实际数据
const emptyTransfers: TransferData[] = [];

// 从API获取交易数据的函数
const fetchTransactions = async (
  page: number, 
  limit: number = 10, 
  currency: string = 'all', 
  searchTerm: string = '', 
  dateFilter: string = ''
): Promise<{ data: TransferData[], total: number }> => {
  try {
    // 构建查询参数
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    if (currency && currency !== 'all') {
      params.append('currency', currency);
    }
    
    if (searchTerm) {
      params.append('search', searchTerm);
    }
    
    if (dateFilter) {
      params.append('date', dateFilter);
    }
    
    // 数据源是 /api/transfers（划款单），不是 /api/transactions。
    // 本页按「一次划款」呈现：转出账户、转入账户、到账金额、手续费、汇率，
    // 而 transactions 里每次划款是拆成转出/转入两条独立流水的，
    // 既无配对关系也无手续费与汇率，字段对不上会导致渲染时读到 undefined。
    const result = await apiRequest('GET', `/api/transfers?${params.toString()}`);

    if (!result.success) {
      throw new Error(result.message || '获取划款记录失败');
    }

    return {
      data: (result.data?.transfers ?? []).map((t: any) => ({
        ...t,
        status: toStatusLabel(t.status),
      })),
      total: result.data?.total ?? 0
    };
  } catch (error) {
    console.error('获取划款记录错误:', error);
    return { data: [], total: 0 };
  }
};

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

// 获取状态样式（可点击版本）
/**
 * 服务端状态码 → 界面标签。
 * 服务端存的是 pending / approved / to_be_executed / completed / rejected，
 * 而本页的样式判断和「能不能点」判断用的都是中文标签 —— 不映射的话，
 * 状态徽章显示英文原文，审批入口也永远出不来（判断条件恒不成立）。
 */
const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: '待审批',
  approved: '待执行',
  to_be_executed: '待执行',
  completed: '已完成',
  rejected: '已拒绝',
};
const toStatusLabel = (status: string) => TRANSFER_STATUS_LABELS[status] ?? status;

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
    case "待归帐":
      return "bg-orange-100 text-orange-800 cursor-pointer hover:bg-orange-200";
    case "待执行":
      return "bg-indigo-100 text-indigo-800 cursor-pointer hover:bg-indigo-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

// 获取状态样式（不可点击版本）
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
    case "待归帐":
      return "bg-orange-100 text-orange-800";
    case "待执行":
      return "bg-indigo-100 text-indigo-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

// 空数据显示组件
// 不再需要NoDataDisplay组件定义，已使用统一的EmptyState替代

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
            pageType="all"
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

const TransferTable = ({ 
  transfers, 
  onStatusChange 
}: { 
  transfers: TransferData[], 
  onStatusChange: (id: string, newStatus: string) => void 
}) => {
  const isMobile = useIsMobile();
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  
  if (transfers.length === 0) {
    return (
      <EmptyState 
        title="暂无划款记录" 
        description="当有新的划款记录时，将会显示在这里"
        icon={<FileText className="h-12 w-12 text-muted-foreground opacity-50" />}
      />
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
                    <TableCell>{transfer.fromCurrency}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(transfer.amount, transfer.fromCurrency)}
                    </TableCell>
                    <TableCell>
                      {transfer.officialExchangeRate ? transfer.officialExchangeRate.toFixed(4) : "-"}
                    </TableCell>
                    <TableCell>
                      {transfer.actualExchangeRate ? transfer.actualExchangeRate.toFixed(4) : "-"}
                    </TableCell>
                    <TableCell>{transfer.toAccount}</TableCell>
                    <TableCell>{transfer.toCurrency}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(transfer.toAmount, transfer.toCurrency)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(transfer.fees, "CNY")}
                    </TableCell>
                    <TableCell className={transfer.exchangeLoss > 0 ? "text-red-500" : ""}>
                      {transfer.exchangeLoss > 0 
                        ? formatCurrency(transfer.exchangeLoss, transfer.toCurrency) 
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-xs" 
                        onClick={() => showReasonDialog(transfer.reason)}
                      >
                        查看
                      </Button>
                    </TableCell>
                    <TableCell>{transfer.submitter}</TableCell>
                    <TableCell>{transfer.submitTime}</TableCell>
                    <TableCell>
                      <StatusChangeButton 
                        transferId={transfer.id} 
                        currentStatus={transfer.status} 
                        onStatusChange={onStatusChange}
                        pageType="all"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* 划款事由对话框 */}
      <TransferReasonDialog 
        isOpen={reasonDialogOpen}
        onClose={() => setReasonDialogOpen(false)}
        reason={selectedReason}
      />
    </>
  );
};

// 状态变更处理函数
interface StatusChangeProps {
  transferId: string;
  currentStatus: string;
  onStatusChange: (id: string, newStatus: string) => void;
  pageType?: 'all' | 'pending' | 'processing'; // 页面类型：全部/待审批/待执行
}

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
  const { toast } = useToast();

  const handleApprove = async () => {
    try {
      setIsLoading(true);
      await onApprove(transferId, comment);
      toast({
        title: "审批成功",
        description: "划款申请已通过审批",
      });
      setComment("");
      onClose();
    } catch (error: any) {
      toast({
        title: "审批失败",
        description: error?.message || "操作出错，请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsLoading(true);
      await onReject(transferId, comment);
      toast({
        title: "已拒绝申请",
        description: "划款申请已被拒绝",
      });
      setIsRejectDialogOpen(false);
      setComment("");
      onClose();
    } catch (error: any) {
      toast({
        title: "操作失败",
        description: error?.message || "拒绝申请失败，请稍后重试",
        variant: "destructive",
      });
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

// 注意：StatusBadge组件已删除，所有状态显示和交互都通过StatusChangeButton处理

// 可点击版本的状态按钮组件 - 用于待审批和待执行页面
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

// 新建划款表单接口
interface TransferFormData {
  fromAccount: string;
  fromCurrency: string;
  amount: number;
  toAccount: string;
  toCurrency: string;
  officialExchangeRate: number | null;
  fees: number;
  reason: string;
}

// 新建划款对话框
const NewTransferDialog = ({ 
  isOpen, 
  onClose, 
  onSubmit,
  accounts,
  currencies
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSubmit: (data: TransferFormData) => void,
  accounts: string[],
  currencies: string[]
}) => {
  const [formData, setFormData] = useState<TransferFormData>({
    fromAccount: accounts[0] || "",
    fromCurrency: currencies[0] || "CNY",
    amount: 10000,
    toAccount: accounts[1] || (accounts[0] || ""),
    toCurrency: currencies[0] || "CNY",
    officialExchangeRate: null,
    fees: 0,
    reason: "日常运营资金调拨"
  });
  
  // 是否跨币种划款
  const isCrossCurrency = formData.fromCurrency !== formData.toCurrency;
  
  // 处理表单输入变化
  const handleChange = (field: keyof TransferFormData, value: any) => {
    setFormData(prev => {
      // 特殊处理：当币种变化时
      if (field === "fromCurrency" || field === "toCurrency") {
        // 检查是否变成了跨币种划款
        const newIsCrossCurrency = 
          field === "fromCurrency" 
            ? value !== prev.toCurrency 
            : prev.fromCurrency !== value;
        
        // 如果变成了跨币种划款，设置默认汇率为1
        if (newIsCrossCurrency && !prev.officialExchangeRate) {
          return {
            ...prev,
            [field]: value,
            officialExchangeRate: 1
          };
        }
        
        // 如果变成了同币种划款，清除汇率和手续费
        if (!newIsCrossCurrency && prev.officialExchangeRate) {
          return {
            ...prev,
            [field]: value,
            officialExchangeRate: null,
            fees: 0
          };
        }
      }
      
      return {
        ...prev,
        [field]: value
      };
    });
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };
  
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-[500px]">
        <AlertDialogHeader>
          <AlertDialogTitle>新建内部划款</AlertDialogTitle>
          <AlertDialogDescription>
            请填写划款信息，带 * 的为必填项
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* 划出账户 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                划出账户 *
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.fromAccount}
                onChange={(e) => handleChange("fromAccount", e.target.value)}
                required
              >
                {accounts.map(account => (
                  <option key={account} value={account}>{account}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                划出币种 *
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.fromCurrency}
                onChange={(e) => handleChange("fromCurrency", e.target.value)}
                required
              >
                {currencies.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* 划入账户 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                划入账户 *
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.toAccount}
                onChange={(e) => handleChange("toAccount", e.target.value)}
                required
              >
                {accounts.map(account => (
                  <option key={account} value={account}>{account}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                划入币种 *
              </label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.toCurrency}
                onChange={(e) => handleChange("toCurrency", e.target.value)}
                required
              >
                {currencies.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* 金额 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              划款金额 *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={formData.amount}
              onChange={(e) => handleChange("amount", parseFloat(e.target.value) || 0)}
              required
            />
          </div>
          
          {/* 官方汇率 (仅在跨币种时显示) */}
          {isCrossCurrency && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                官方汇率 *
              </label>
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={formData.officialExchangeRate || ""}
                onChange={(e) => handleChange("officialExchangeRate", parseFloat(e.target.value) || null)}
                required={isCrossCurrency}
              />
              <p className="text-xs text-muted-foreground">
                官方汇率用于计算汇损，实际汇率将在录入到账金额后自动计算
              </p>
            </div>
          )}
          
          {/* 手续费 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              手续费 (CNY)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={formData.fees}
              onChange={(e) => handleChange("fees", parseFloat(e.target.value) || 0)}
            />
          </div>
          
          {/* 划款事由 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              划款事由 *
            </label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={formData.reason}
              onChange={(e) => handleChange("reason", e.target.value)}
              required
            />
          </div>
        </form>
        
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit}>
            提交
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// 划款列表区域组件
interface TransferListSectionProps {
  paginatedTransfers: TransferData[];
  hasMore: boolean;
  isLoading: boolean;
  onStatusChange: (id: string, newStatus: string) => void;
  onLoadMore: () => void;
  onNewTransfer: () => void;
}

const TransferListSection = ({ 
  paginatedTransfers, 
  hasMore, 
  isLoading, 
  onStatusChange, 
  onLoadMore,
  onNewTransfer
}: TransferListSectionProps) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">划款记录列表</h3>
        <Button 
          onClick={onNewTransfer}
          className="flex items-center gap-1"
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span>新建划款</span>
        </Button>
      </div>
      
      <TransferTable 
        transfers={paginatedTransfers} 
        onStatusChange={onStatusChange} 
      />
      
      {paginatedTransfers.length > 0 && hasMore && (
        <div className="flex justify-center mt-6 mb-8">
          <LoadMoreButton 
            onClick={onLoadMore} 
            isLoading={isLoading} 
          />
        </div>
      )}
    </div>
  );
};

const InternalTransactions: React.FC = () => {
  const isMobile = useIsMobile();
  const [selectedCurrency, setSelectedCurrency] = useState("all");
  const [transferType, setTransferType] = useState("all");
  const [allTransfers, setAllTransfers] = useState<TransferData[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [dateString, setDateString] = useState("");
  const [isNewTransferDialogOpen, setIsNewTransferDialogOpen] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  
  // 获取币种数据
  const [currencyList, setCurrencyList] = useState<string[]>([]);
  const [isLoadingCurrencies, setIsLoadingCurrencies] = useState(true);
  
  const ITEMS_PER_PAGE = 50;
  
  // 加载币种数据
  useEffect(() => {
    const fetchCurrencyData = async () => {
      try {
        setIsLoadingCurrencies(true);
        const currencyTypes = await getCurrencyTypes();
        if (currencyTypes && currencyTypes.length > 0) {
          // 从API结果中提取币种代码
          const currencyCodes = currencyTypes.map(c => c.code);
          setCurrencyList(currencyCodes);
        } else {
          // 如果API没有返回数据，使用默认币种
          setCurrencyList(["CNY", "USD", "EUR", "JPY"]);
        }
      } catch (error) {
        console.error("获取币种数据失败:", error);
        // 使用默认币种
        setCurrencyList(["CNY", "USD", "EUR", "JPY"]);
      } finally {
        setIsLoadingCurrencies(false);
      }
    };

    fetchCurrencyData();
  }, []);
  
  // 处理状态变更
  const { toast } = useToast();

  /**
   * 划款审批。
   *
   * 此前这里只改前端数组里的状态、把审批人硬写成「系统管理员」，
   * 服务端一无所知 —— 刷新页面状态就退回去了，而真正的审批链、
   * 权限校验、落账都没有发生。改为调用服务端接口，再以服务端结果刷新列表。
   */
  const handleStatusChange = async (id: string, newStatus: string) => {
    const decision = newStatus === '已完成' ? 'approved'
                   : newStatus === '已拒绝' ? 'rejected'
                   : null;
    if (!decision) {
      toast({ title: '不支持的状态', description: `无法把划款置为「${newStatus}」`, variant: 'destructive' });
      return;
    }

    try {
      const res = await apiRequest('PUT', `/api/transfers/${id}/status`, { status: decision });
      if (!res?.success) throw new Error(res?.message || res?.error?.message || '审批失败');

      toast({
        title: decision === 'approved' ? '审批通过' : '审批拒绝',
        description: decision === 'approved'
          ? `划款 ${id} 已审批通过`
          : `划款 ${id} 已被拒绝`,
      });
      // 以服务端结果为准重新拉取，避免界面与库不一致
      await loadTransactionData(1, true);
    } catch (error: any) {
      toast({
        title: '审批失败',
        description: error?.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };
  
  // 可用账户列表 (实际应该从API获取)
  const accounts = ["运营账户A", "运营账户B", "外汇账户A", "外汇账户B", "投资账户A"];
  
  // 创建新的划款记录
  const handleNewTransfer = (formData: TransferFormData) => {
    // 生成新ID
    const newId = `TR${String(allTransfers.length + 1).padStart(3, '0')}`;
    
    // 计算实际汇率和到账金额
    const isSameCurrency = formData.fromCurrency === formData.toCurrency;
    const actualExchangeRate = isSameCurrency ? null : formData.officialExchangeRate;
    let toAmount = formData.amount;
    let exchangeLoss = 0;
    
    // 同币种划款，到账金额等于划出金额
    if (isSameCurrency) {
      toAmount = formData.amount;
    } 
    // 跨币种划款，需要设置实际汇率和计算汇损
    else if (actualExchangeRate) {
      // 假设实际汇率等于官方汇率 (在实际实施中，这通常是在到账金额确认后才确定的)
      toAmount = +(formData.amount / actualExchangeRate).toFixed(2);
      exchangeLoss = 0; // 实际应用中由实际到账金额决定
    }
    
    // 创建新划款记录
    const newTransfer: TransferData = {
      id: newId,
      fromAccount: formData.fromAccount,
      fromCurrency: formData.fromCurrency,
      amount: formData.amount,
      actualExchangeRate,
      officialExchangeRate: formData.officialExchangeRate,
      toAccount: formData.toAccount,
      toCurrency: formData.toCurrency,
      toAmount,
      submitter: "当前用户",
      submitTime: format(new Date(), 'yyyy-MM-dd HH:mm'),
      approver: "",
      approveTime: "",
      fees: formData.fees,
      exchangeLoss,
      reason: formData.reason,
      status: "未提交"
    };
    
    // 添加到数据列表
    setAllTransfers(prev => [newTransfer, ...prev]);
    
    // 关闭对话框
    setIsNewTransferDialogOpen(false);
  };
  
  // 加载更多数据
  // 从API加载交易数据
  const loadTransactionData = async (pageNum: number, isInitialLoad: boolean = false) => {
    setIsLoading(true);
    try {
      // 构建日期字符串
      const formattedDate = dateFilter ? format(dateFilter, 'yyyy-MM-dd') : '';
      
      // 调用API获取数据
      const result = await fetchTransactions(
        pageNum, 
        ITEMS_PER_PAGE, 
        selectedCurrency, 
        searchTerm,
        formattedDate
      );
      
      if (isInitialLoad || pageNum === 1) {
        // 首次加载或筛选条件变化时，替换所有数据
        setAllTransfers(result.data);
      } else {
        // 加载更多时，追加数据
        setAllTransfers(prev => [...prev, ...result.data]);
      }
      
      // 更新总数量
      setTotalItems(result.total);
      
    } catch (error) {
      console.error("加载交易数据失败:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 加载更多数据
  const handleLoadMore = () => {
    const nextPage = page + 1;
    loadTransactionData(nextPage);
    setPage(nextPage);
  };
  
  // 初始加载和筛选条件变化时重新加载数据
  useEffect(() => {
    if (!isLoadingCurrencies && currencyList.length > 0) {
      // 重置页码并加载第一页数据
      setPage(1);
      loadTransactionData(1, true);
    }
  }, [selectedCurrency, transferType, searchTerm, dateString, isLoadingCurrencies, currencyList]);
  
  // 筛选数据
  const filteredTransfers = allTransfers.filter(transfer => {
    // 币种筛选
    if (selectedCurrency !== "all" && transfer.fromCurrency !== selectedCurrency) {
      return false;
    }
    
    // 划款类型筛选
    if (transferType === "same" && transfer.fromCurrency !== transfer.toCurrency) {
      return false;
    }
    if (transferType === "exchange" && transfer.fromCurrency === transfer.toCurrency) {
      return false;
    }
    
    // 搜索筛选
    const searchLower = searchTerm.toLowerCase();
    if (searchTerm && !transfer.id.toLowerCase().includes(searchLower) && 
        !transfer.fromAccount.toLowerCase().includes(searchLower) && 
        !transfer.toAccount.toLowerCase().includes(searchLower) && 
        !transfer.submitter.toLowerCase().includes(searchLower) &&
        !transfer.status.toLowerCase().includes(searchLower)) {
      return false;
    }
    
    // 日期筛选
    if (dateFilter && !transfer.submitTime.includes(format(dateFilter, 'yyyy-MM-dd'))) {
      return false;
    }
    
    return true;
  });
  
  // 分页数据
  const paginatedTransfers = filteredTransfers;
  
  // 是否有更多数据
  const hasMore = false; // 分页由后端控制
  
  // 处理日期选择
  const handleDateSelect = (date: Date | undefined) => {
    setDateFilter(date);
    if (date) {
      setDateString(format(date, 'yyyy-MM-dd'));
    } else {
      setDateString('');
    }
  };
  
  // 清除筛选条件
  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter(undefined);
    setDateString('');
  };
  
  // 是否有筛选条件
  const hasFilters = searchTerm !== "" || dateFilter !== undefined;
  
  // 如果正在加载币种数据，显示加载指示器
  if (isLoadingCurrencies) {
    return (
      <PageLayout title="内部划款记录" subtitle="查看所有内部资金划转记录">
        <div className="flex flex-col items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p className="text-muted-foreground">加载币种数据...</p>
        </div>
      </PageLayout>
    );
  }
  
  return (
    <PageLayout title="内部划款记录" subtitle="查看所有内部资金划转记录">
      <div className="space-y-6">
        {/* 自动记账提示 */}
        <div className="bg-blue-50 text-blue-800 p-3 rounded-md border border-blue-200 text-sm">
          <p>
            <span className="font-medium">自动记账规则：</span> 当产生新的内部划款记录时，系统会自动生成以下交易记录：
          </p>
          <ul className="list-disc list-inside mt-1 pl-2 space-y-1">
            <li>手续费记录（始终作为支出类型）- 描述格式：由于YYYY年MM月DD日从账户X划款XX金额至账户Y，产生手续费</li>
            <li>汇损记录（正值为收入，负值为支出）- 描述格式：由于YYYY年MM月DD日从账户X划款XX金额至账户Y，产生汇损</li>
          </ul>
        </div>
        
        {/* 搜索和筛选卡片 */}
        <Card className="p-4">
          <CardContent className="p-0">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex items-center flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="搜索划款记录..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn(
                      "justify-start text-left font-normal",
                      !dateString && "text-muted-foreground",
                      "w-full sm:w-auto gap-1"
                    )}>
                      <Calendar className="h-4 w-4" />
                      {dateString ? dateString : <span>选择日期</span>}
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

        {/* 币种筛选 - 使用与账户管理页一致的样式 */}
        <Tabs 
          defaultValue="全部币种" 
          className="w-full"
          onValueChange={(value) => {
            const newCurrency = value === '全部币种' ? 'all' : value;
            if (newCurrency !== selectedCurrency) {
              setSelectedCurrency(newCurrency);
              setPage(1);
            }
          }}
        >
          <div className="mb-8">
            <div className="mb-2 w-full">
              <div className="mb-1">
                <TabsList className="flex flex-wrap h-auto rounded-md bg-muted p-1 w-full justify-start">
                  <TabsTrigger 
                    value="全部币种" 
                    className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                  >
                    {getCurrencyIcon("全部币种")}
                    全部币种
                  </TabsTrigger>
                  
                  {currencyList.map((currency) => (
                    <TabsTrigger 
                      key={currency} 
                      value={currency} 
                      className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                    >
                      {getCurrencyIcon(currency)}
                      {currency}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="h-[1px] bg-border w-full"></div>
            </div>
          </div>

          <TabsContent value="全部币种">
            {/* 划款类型筛选 */}
            <Tabs 
              defaultValue="全部划款" 
              className="w-full mb-6"
              onValueChange={(value) => {
                let newType;
                if (value === '全部划款') newType = 'all';
                else if (value === '同币种划款') newType = 'same';
                else newType = 'exchange';
                
                if (newType !== transferType) {
                  setTransferType(newType);
                  setPage(1);
                }
              }}
            >
              <div className="mb-8">
                <div className="mb-2 w-full">
                  <div className="mb-1">
                    <TabsList className="flex flex-wrap h-auto rounded-md bg-muted p-1 w-full justify-start">
                      <TabsTrigger 
                        value="全部划款" 
                        className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                      >
                        <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                        全部划款
                      </TabsTrigger>
                      <TabsTrigger 
                        value="同币种划款" 
                        className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                      >
                        <CornerRightDown className="h-4 w-4 mr-1.5" />
                        同币种划款
                      </TabsTrigger>
                      <TabsTrigger 
                        value="跨币种划款" 
                        className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                      >
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                        跨币种划款（换汇）
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <div className="h-[1px] bg-border w-full"></div>
                </div>
              </div>

              <TabsContent value="全部划款">
                <TransferListSection 
                  paginatedTransfers={paginatedTransfers}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  onStatusChange={handleStatusChange}
                  onLoadMore={handleLoadMore}
                  onNewTransfer={() => setIsNewTransferDialogOpen(true)}
                />
              </TabsContent>
              
              <TabsContent value="同币种划款">
                <TransferListSection 
                  paginatedTransfers={paginatedTransfers}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  onStatusChange={handleStatusChange}
                  onLoadMore={handleLoadMore}
                  onNewTransfer={() => setIsNewTransferDialogOpen(true)}
                />
              </TabsContent>
              
              <TabsContent value="跨币种划款">
                <TransferListSection 
                  paginatedTransfers={paginatedTransfers}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  onStatusChange={handleStatusChange}
                  onLoadMore={handleLoadMore}
                  onNewTransfer={() => setIsNewTransferDialogOpen(true)}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
          
          {currencyList.map((currency) => (
            <TabsContent key={currency} value={currency}>
              {/* 划款类型筛选 */}
              <Tabs 
                defaultValue="全部划款" 
                className="w-full mb-6"
                onValueChange={(value) => {
                  let newType;
                  if (value === '全部划款') newType = 'all';
                  else if (value === '同币种划款') newType = 'same';
                  else newType = 'exchange';
                  
                  if (newType !== transferType) {
                    setTransferType(newType);
                    setPage(1);
                  }
                }}
              >
                <div className="mb-8">
                  <div className="mb-2 w-full">
                    <div className="mb-1">
                      <TabsList className="flex flex-wrap h-auto rounded-md bg-muted p-1 w-full justify-start">
                        <TabsTrigger 
                          value="全部划款" 
                          className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                        >
                          <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                          全部划款
                        </TabsTrigger>
                        <TabsTrigger 
                          value="同币种划款" 
                          className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                        >
                          <CornerRightDown className="h-4 w-4 mr-1.5" />
                          同币种划款
                        </TabsTrigger>
                        <TabsTrigger 
                          value="跨币种划款" 
                          className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                        >
                          <RefreshCw className="h-4 w-4 mr-1.5" />
                          跨币种划款（换汇）
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    <div className="h-[1px] bg-border w-full"></div>
                  </div>
                </div>

                <TabsContent value="全部划款">
                  <TransferListSection 
                    paginatedTransfers={paginatedTransfers}
                    hasMore={hasMore}
                    isLoading={isLoading}
                    onStatusChange={handleStatusChange}
                    onLoadMore={handleLoadMore}
                    onNewTransfer={() => setIsNewTransferDialogOpen(true)}
                  />
                </TabsContent>
                
                <TabsContent value="同币种划款">
                  <TransferListSection 
                    paginatedTransfers={paginatedTransfers}
                    hasMore={hasMore}
                    isLoading={isLoading}
                    onStatusChange={handleStatusChange}
                    onLoadMore={handleLoadMore}
                    onNewTransfer={() => setIsNewTransferDialogOpen(true)}
                  />
                </TabsContent>
                
                <TabsContent value="跨币种划款">
                  <TransferListSection 
                    paginatedTransfers={paginatedTransfers}
                    hasMore={hasMore}
                    isLoading={isLoading}
                    onStatusChange={handleStatusChange}
                    onLoadMore={handleLoadMore}
                    onNewTransfer={() => setIsNewTransferDialogOpen(true)}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
        
        {/* 添加新建划款对话框 */}
        <NewTransferDialog 
          isOpen={isNewTransferDialogOpen}
          onClose={() => setIsNewTransferDialogOpen(false)}
          onSubmit={handleNewTransfer}
          accounts={accounts}
          currencies={currencyList}
        />

        {filteredTransfers.length === 0 && hasFilters && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={clearFilters}>
              清除筛选条件
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default InternalTransactions;