import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { toast } from "sonner";
import { LoanList } from "./LoanList";
import { LoanSettlementDialog } from "./LoanSettlementDialog";
import { usePermissions } from "../../hooks/use-permissions";
import PageLayout from "../../components/layout/PageLayout";
import LoadMoreButton from "../../components/common/LoadMoreButton";
import { useIsMobile } from "../../hooks/use-mobile";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Calendar as CalendarComponent } from "../../components/ui/calendar";
import { zhCN } from "date-fns/locale";
import { 
  Search, 
  Calendar, 
  ClipboardList, 
  ArrowLeft, 
  ArrowRight, 
  BadgeDollarSign,
  Loader2
} from "lucide-react";
import type { Loan, LoanType, LoanSettlement } from "../../types/loan";
import { fetchAPI } from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";

// 定义借贷记录API接口
interface LoanRecordResponse {
  success: boolean;
  data: {
    loans: Loan[];
    total: number;
  };
  message?: string;
}

const loanTypes: LoanType[] = [
  "应收款",
  "预收款",
  "应付款",
  "预付款",
  "押金",
  "借出",
  "借入",
];

export default function LoanRecords() {
  const isMobile = useIsMobile();
  const { currentProject } = useAuth();
  const { can } = usePermissions();
  const canSettle = can('manage_accounting');
  // 删除借贷记录走资产管理权限，与手工销账的会计权限不是一回事
  const canDelete = can('manage_assets');
  const [selectedType, setSelectedType] = useState<LoanType | "全部">("全部");
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isSettlementDialogOpen, setIsSettlementDialogOpen] = useState(false);
  const [allLoans, setAllLoans] = useState<Loan[]>([]);
  const [visibleLoans, setVisibleLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const PAGE_SIZE = 50;

  // 从API获取借贷记录
  const fetchLoans = async (page: number = 1, type: string = "all") => {
    try {
      setLoading(true);
      setError(null);

      // 构建查询参数
      const queryParams = new URLSearchParams();
      queryParams.append('page', page.toString());
      queryParams.append('limit', PAGE_SIZE.toString());
      
      if (type !== "全部") {
        queryParams.append('type', type);
      }
      
      if (searchTerm) {
        queryParams.append('searchTerm', searchTerm);
      }
      
      if (dateFilter) {
        const formattedDate = dateFilter.toISOString().split('T')[0];
        queryParams.append('date', formattedDate);
      }

      // 发送API请求
      const url = `/api/loans?${queryParams.toString()}`;
      console.log(`获取借贷记录: ${url}`);
      
      // 使用模拟响应 - 稍后实现真实API
      const response = await fetchAPI(url);

      if (response.success) {
        return response.data.loans;
      } else {
        throw new Error(response.message || '获取借贷记录失败');
      }
    } catch (error: any) {
      console.error('获取借贷记录失败:', error);
      setError(error.message || '获取借贷记录失败');
      return [];
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  /** 重新拉取当前筛选条件下的列表，写操作之后必须调用，否则界面停留在旧数据上 */
  const reload = async () => {
    const loans = await fetchLoans(1, selectedType);
    setAllLoans(loans);
    setVisibleLoans(loans.slice(0, PAGE_SIZE));
    setPage(1);
  };

  // 根据选择的类型初始化数据
  useEffect(() => {
    // 重置分页
    setPage(1);
    
    // 加载数据
    const loadData = async () => {
      setInitialLoading(true);
      const loans = await fetchLoans(1, selectedType);
      setAllLoans(loans);
      setVisibleLoans(loans.slice(0, PAGE_SIZE));
      setInitialLoading(false);
    };
    
    loadData();
  }, [selectedType, searchTerm, dateFilter, currentProject?.id]);

  // 当allLoans变化或页码变化时，更新可见的贷款列表
  useEffect(() => {
    setVisibleLoans(allLoans.slice(0, page * PAGE_SIZE));
  }, [allLoans, page]);

  const handleLoadMore = () => {
    setLoading(true);
    
    // 模拟网络请求延迟
    setTimeout(() => {
      setPage(prevPage => prevPage + 1);
      setLoading(false);
    }, 500);
  };

  const handleSettle = (loan: Loan) => {
    setSelectedLoan(loan);
    setIsSettlementDialogOpen(true);
  };

  /**
   * 手工销账：收不回的借款、不打算还的贷款，由会计做平。
   * 正常还款应走「申请收款/付款 → 还款收入/还款支出」，由流水自动回冲。
   * 此前这里只弹了一句「销账成功」而没有调接口，界面显示已销、库里分文未动。
   */
  const handleSettleSubmit = async (data: { amount: number; description: string }) => {
    if (!selectedLoan) return;
    try {
      const res = await fetchAPI(`/api/loans/${selectedLoan.id}/settle`, {
        method: 'POST',
        body: JSON.stringify({ amount: data.amount, description: data.description }),
      });
      if (!res?.success) throw new Error(res?.message || res?.error?.message || '销账失败');
      toast.success("销账成功");
      setIsSettlementDialogOpen(false);
      setSelectedLoan(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || '销账失败');
    }
  };

  const handleDelete = async (loan: Loan) => {
    try {
      const res = await fetchAPI(`/api/loans/${loan.id}`, { method: 'DELETE' });
      if (!res?.success) throw new Error(res?.message || res?.error?.message || '删除失败');
      toast.success("删除成功");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || '删除失败');
    }
  };

  return (
    <PageLayout title="借贷记录" subtitle="查看和管理所有借贷与应收应付款项">
      <div className="space-y-6">
        {/* 搜索和筛选卡片 */}
        <Card className="p-4">
          <CardContent className="p-0 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 w-full">
                  <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder="搜索借贷记录ID、描述或部门..."
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
                        <span className="text-muted-foreground">选择日期...</span>
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      initialFocus
                      locale={zhCN}
                      selected={undefined}
                      onSelect={(date) => console.log('Selected date:', date)}
                      disabled={(date) => date > new Date() || date < new Date("2023-01-01")}
                      className="rounded-md border"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Tabs defaultValue="全部" className="w-full">
          <TabsList className="flex flex-wrap">
            <TabsTrigger 
              value="全部" 
              onClick={() => setSelectedType("全部")}
              className="flex items-center gap-2"
            >
              <ClipboardList className="h-4 w-4" />
              <span>全部类型</span>
            </TabsTrigger>
            {loanTypes.map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                onClick={() => setSelectedType(type)}
                className="flex items-center gap-2"
              >
                {type === "应收款" || type === "预收款" ? (
                  <ArrowLeft className="h-4 w-4" />
                ) : type === "应付款" || type === "预付款" ? (
                  <ArrowRight className="h-4 w-4" />
                ) : (
                  <BadgeDollarSign className="h-4 w-4" />
                )}
                <span>{type}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value="全部" className="mt-6">
            <LoanList
              loans={visibleLoans}
              onSettle={handleSettle}
              canSettle={canSettle}
              canDelete={canDelete}
              onDelete={handleDelete}
            />
          </TabsContent>
          
          {loanTypes.map((type) => (
            <TabsContent key={type} value={type} className="mt-6">
              <LoanList
                loans={visibleLoans}
                onSettle={handleSettle}
                canSettle={canSettle}
                canDelete={canDelete}
                onDelete={handleDelete}
              />
            </TabsContent>
          ))}
        </Tabs>

        {visibleLoans.length > 0 && visibleLoans.length < allLoans.length && (
          <div className="flex justify-center mt-6">
            <LoadMoreButton 
              onClick={handleLoadMore}
              isLoading={loading}
            />
          </div>
        )}

        {selectedLoan && (
          <LoanSettlementDialog
            open={isSettlementDialogOpen}
            onClose={() => setIsSettlementDialogOpen(false)}
            onSubmit={handleSettleSubmit}
            maxAmount={selectedLoan.remainingAmount}
          />
        )}
      </div>
    </PageLayout>
  );
}
