import React, { useState, useEffect } from "react";
import { safeFormatCurrency } from "../utils/formatter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageLayout from "../components/layout/PageLayout";
import LoadMoreButton from "../components/common/LoadMoreButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { usePermissions } from "../hooks/use-permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl } from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useForm } from "react-hook-form";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar as CalendarComponent } from "../components/ui/calendar";
import { 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  Trash2, 
  Computer, 
  Smartphone, 
  Laptop, 
  Building, 
  X,
  Search,
  Calendar,
  CreditCard,
  FileText,
  Loader2
} from "lucide-react";
import { format, isValid, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "../lib/utils";
import { useIsMobile } from "../hooks/use-mobile";
import { useToast } from "../hooks/use-toast";
import { apiRequest } from "../api/client";

interface DepreciationRecord {
  id: string;
  amount: number;
  quantity: number;
  date: string;
  approver: string;
  description: string;
  /** sale 由出售流水自动产生，其余三种是会计手动登记 */
  reason?: 'sale' | 'depreciation' | 'impairment' | 'writeoff';
  reasonText?: string;
}

// 后端返回的资产数据接口
interface AssetData {
  id: number;
  name: string;
  type: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  remaining_value: number;
  currency_type: string;
  department: string;
  description: string;
  status: string;
  submitter_id: number;
  approver_id: number;
  submitted_at: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  asset_type_name: string | null;
}

// 前端使用的资产数据接口
interface Asset {
  id: string;
  currencyType: string;
  name: string;
  quantity: number;
  unitPrice: number | string;
  type: string;
  department: string;
  description: string;
  submitter: string;
  approver: string;
  operationTime: string;
  amount: number | string;
  remainingValue: number | string;
  status: string;
  depreciationRecords: DepreciationRecord[];
  deletionCountdown?: string; // 可选字段
}

/**
 * 后端状态枚举 → 中文展示。
 * 账面价值的减少可能来自折旧、减值、报损或出售，统称「处置」，
 * 原先一律叫「核销」，看不出这笔资产是正常折旧还是已经报废。
 */
const ASSET_STATUS_LABELS: Record<string, string> = {
  normal: '正常',
  depreciating: '部分处置',
  written_off: '账面已归零',
  disposed: '已出售',
};

interface DepreciationFormData {
  quantity: number;
  amount: number;
  description: string;
  /**
   * 折旧＝正常损耗分摊，减值＝价值下跌，报损＝资产灭失。
   * 三者都由会计手动操作、都永久留痕，区别只在原因。
   */
  reason: 'depreciation' | 'impairment' | 'writeoff';
}

const AssetRecordsContent: React.FC = () => {
  // 报损/减值是把资产做平的最后一步，只有会计能做；
  // 非会计仍可查看资产和处置记录，只是按钮不可点
  const { can } = usePermissions();
  const canAccount = can('manage_accounting');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isDepreciationDialogOpen, setIsDepreciationDialogOpen] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  // 服务端总数，用于判断还有没有下一页
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const form = useForm<DepreciationFormData>({
    defaultValues: {
      quantity: 1,
      amount: 0,
      description: "",
      reason: 'depreciation',
    },
  });

  // 从数据库API获取资产列表
  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async (pageNum: number = 1, append: boolean = false) => {
    if (!append) setIsLoading(true);
    setError(null);
    
    try {
      // 获取当前项目ID
      let projectId;
      try {
        const projectData = localStorage.getItem('currentProject');
        if (projectData) {
          const project = JSON.parse(projectData);
          projectId = project.id;
        } else {
          projectId = 1; // 默认项目ID
        }
      } catch (e) {
        console.error('解析项目ID出错:', e);
        projectId = 1;
      }
      
      console.log('使用项目ID:', projectId);
      
      // 从API获取资产数据
      // 带上分页：服务端默认只给一页，不传的话后面的资产取不到
      const result = await apiRequest(
        'GET', `/api/assets?projectId=${projectId}&page=${pageNum}&limit=${PAGE_SIZE}`
      );

      if (result && result.success) {
        // 获取资产数据
        const assetsData = result.data?.assets || result.data || [];
        setTotal(result.data?.total ?? assetsData.length);

        if (!Array.isArray(assetsData) || assetsData.length === 0) {
          // 追加模式下拉到空页，保留已有数据
          if (!append) setAssets([]);
        } else {
          // 转换为前端需要的格式
          const formattedAssets: Asset[] = assetsData.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            currencyType: item.currency_type || 'CNY',
            quantity: item.quantity || 1,
            unitPrice: item.unit_price ? item.unit_price.toString() : '0',
            amount: item.total_price ? item.total_price.toString() : '0',
            remainingValue: item.remaining_value ? item.remaining_value.toString() : '0',
            type: item.asset_type_name || '未分类',
            department: item.department || '未知部门',
            description: item.description || '',
            submitter: item.submitter_name || '系统',
            approver: item.approver_name || '—',
            operationTime: item.submitted_at ? new Date(item.submitted_at).toLocaleDateString('zh-CN') : 
                         new Date().toLocaleDateString('zh-CN'),
            status: ASSET_STATUS_LABELS[item.status] || item.status || '正常',
            depreciationRecords: item.depreciation_records || []
          }));
          
          console.log('格式化后的资产数据:', formattedAssets);
          setAssets(prev => append ? [...prev, ...formattedAssets] : formattedAssets);
        }
      } else {
        throw new Error('获取资产列表失败');
      }
    } catch (err: any) {
      console.error('获取资产列表失败:', err);
      setError(err.message || '获取资产列表失败，请稍后重试');
      toast({
        title: "获取资产列表失败",
        description: err.message || '请稍后重试',
        variant: "destructive"
      });
      // 获取失败时清空并显示暂无数据；追加失败则保留已加载的部分
      if (!append) setAssets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleDepreciation = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsDepreciationDialogOpen(true);
  };

  // 此前两处删除按钮都只是 console.log，点了毫无反应。
  // 资产属于财务数据，删除必须二次确认后再真正调用接口。
  const confirmDeleteAsset = async () => {
    if (!deletingAsset) return;
    try {
      const res = await apiRequest('DELETE', `/api/assets/${deletingAsset.id}`);
      if (!res?.success) throw new Error(res?.message || '删除失败');
      toast({ title: "删除成功", description: `资产「${deletingAsset.name}」已删除` });
      fetchAssets();
    } catch (err: any) {
      toast({ title: "删除失败", description: err?.message || '请稍后重试', variant: "destructive" });
    } finally {
      setDeletingAsset(null);
    }
  };

  const onSubmitDepreciation = async (data: DepreciationFormData) => {
    if (!selectedAsset) return;
    
    try {
      // 使用client - 它会自动添加项目ID参数
      const url = `/api/assets/${selectedAsset.id}/depreciate`;
      
      // approverId 由后端取当前登录用户，前端不再伪造
      const response = await apiRequest('POST', url, data);

      if (response.success) {
        toast({
          title: "登记成功",
          description: "资产账面价值已更新，处置记录已保留",
        });
        
        // 重新获取数据
        fetchAssets();
      } else {
        throw new Error(response.message || '登记失败');
      }
    } catch (err: any) {
      console.error('资产处置登记失败:', err);
      toast({
        title: "登记失败",
        description: err.message || '请稍后重试',
        variant: "destructive"
      });
    } finally {
      setIsDepreciationDialogOpen(false);
      form.reset();
    }
  };

  /**
   * 加载更多。
   * 此前这里只是等 1 秒然后什么都不做 —— 按钮点了没有任何效果，
   * 超出首页的资产永远看不到。
   */
  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      const next = page + 1;
      await fetchAssets(next, true);
      setPage(next);
    } finally {
      setIsLoadingMore(false);
    }
  };
  
  // 根据类型筛选资产
  const filteredAssets = assets.filter(asset => {
    // 先按搜索词筛选
    const matchesSearch = searchTerm === "" || 
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      asset.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.id.toString().includes(searchTerm);
    
    // 再按标签筛选
    if (!matchesSearch) return false;
    
    if (activeTab === "all") return true;
    if (activeTab === "computers" && asset.type.includes("电脑")) return true;
    if (activeTab === "phones" && asset.type.includes("手机")) return true;
    if (activeTab === "electronics" && asset.type.includes("电子")) return true;
    if (activeTab === "furniture" && asset.type.includes("家具")) return true;
    if (activeTab === "simcards" && asset.type.includes("卡")) return true;
    
    return false;
  });

  const assetTabs = [
    { id: "all", label: "全部" },
    { id: "computers", label: "电脑设备", icon: Computer },
    { id: "phones", label: "手机设备", icon: Smartphone },
    { id: "electronics", label: "其他电子设备", icon: Laptop },
    { id: "furniture", label: "办公家具", icon: Building },
    { id: "simcards", label: "手机卡", icon: Smartphone }
  ];

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case "使用中":
        return "bg-green-100 text-green-800";
      case "待审批":
        return "bg-yellow-100 text-yellow-800";
      case "处理中":
        return "bg-blue-100 text-blue-800";
      case "已报废":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // 格式化货币
  const formatCurrency = (amount: number | string, currency: string = "CNY") => {
    // 确保金额是数字类型
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return safeFormatCurrency(numAmount, currency, 'zh-CN');
  };

  // 空数据显示组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <Computer className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无资产记录
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          当有新的资产记录时，将会显示在这里
        </p>
      </div>
    </Card>
  );

  // Mobile table columns - simplified for smaller screens
  const renderMobileAssetTable = (asset: Asset) => (
    <Card className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors mb-4">
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base font-medium">{asset.name}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              {asset.id}
            </div>
          </div>
          <Badge className={getStatusStyle(asset.status)}>
            {asset.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{asset.currencyType}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-primary">
              {formatCurrency(asset.amount, asset.currencyType)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{asset.department}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{asset.operationTime}</span>
          </div>
        </div>
      
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={!canAccount}
            title={canAccount ? '折旧 / 减值 / 报损' : '只有会计可以登记资产处置'}
            onClick={() => handleDepreciation(asset)}
          >
            <X className="h-4 w-4 mr-1" />
            折旧/减值/报损
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeletingAsset(asset)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            删除
          </Button>
        </div>
        
        {expandedRows.includes(asset.id) && (
          <div className="border-t pt-3 mt-3 text-sm space-y-2">
            <div>
              <span className="text-muted-foreground">类型:</span> {asset.type}
            </div>
            <div>
              <span className="text-muted-foreground">描述:</span> {asset.description}
            </div>
            <div>
              <span className="text-muted-foreground">数量:</span> {asset.quantity}
            </div>
            <div>
              <span className="text-muted-foreground">单价:</span> {formatCurrency(asset.unitPrice, asset.currencyType)}
            </div>
            <div>
              <span className="text-muted-foreground">剩余价值:</span> {formatCurrency(asset.remainingValue, asset.currencyType)}
            </div>
            <div>
              <span className="text-muted-foreground">提交人:</span> {asset.submitter}
            </div>
            <div>
              <span className="text-muted-foreground">审批人:</span> {asset.approver}
            </div>
            
            {asset.depreciationRecords.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2 text-sm">处置记录</h4>
                {asset.depreciationRecords.map((record) => (
                  <div key={record.id} className="mb-2 p-2 bg-muted/30 rounded-sm text-xs">
                    <div className="grid grid-cols-2 gap-1">
                      <div><span className="text-muted-foreground">原因:</span> {record.reasonText || '减值'}</div>
                      <div><span className="text-muted-foreground">冲减金额:</span> {formatCurrency(record.amount)}</div>
                      <div><span className="text-muted-foreground">数量:</span> {record.quantity}</div>
                      <div><span className="text-muted-foreground">日期:</span> {record.date}</div>
                      <div><span className="text-muted-foreground">审批人:</span> {record.approver}</div>
                    </div>
                    <div className="mt-1">
                      <span className="text-muted-foreground">描述:</span> {record.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="flex justify-center mt-2">
          <button 
            onClick={() => toggleRow(asset.id)}
            className="text-xs text-muted-foreground flex items-center gap-1"
          >
            {expandedRows.includes(asset.id) ? (
              <>收起详情 <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>查看详情 <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 w-full">
      {/* 添加搜索和筛选卡片 */}
      <Card className="p-4">
        <CardContent className="p-0 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 w-full">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  placeholder="搜索资产名称、ID或部门..."
                  className="w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    
      <Tabs defaultValue="all" className="w-full" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex flex-wrap">
          {assetTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
              {tab.icon && <tab.icon className="h-4 w-4" />}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {assetTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="outline-none">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">正在加载资产数据...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64">
                <p className="text-red-500 mb-2">加载失败: {error}</p>
                <Button onClick={() => fetchAssets(1, false)} variant="outline">重试</Button>
              </div>
            ) : filteredAssets.length === 0 ? (
              <NoDataDisplay />
            ) : isMobile ? (
              <div className="space-y-4">
                {filteredAssets.map((asset) => (
                  <div key={asset.id}>
                    {renderMobileAssetTable(asset)}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <Table className="border rounded-md">
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-10">ID</TableHead>
                      <TableHead>资产名称</TableHead>
                      <TableHead>资产类型</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>部门</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => (
                      <React.Fragment key={asset.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-muted/50 group"
                        >
                          <TableCell className="font-medium">{asset.id}</TableCell>
                          <TableCell className="flex items-center">
                            <button
                              onClick={() => toggleRow(asset.id)}
                              className="mr-2 text-muted-foreground"
                            >
                              {expandedRows.includes(asset.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <span>{asset.name}</span>
                          </TableCell>
                          <TableCell>{asset.type}</TableCell>
                          <TableCell>{asset.quantity}</TableCell>
                          <TableCell>{formatCurrency(asset.amount, asset.currencyType)}</TableCell>
                          <TableCell>{asset.department}</TableCell>
                          <TableCell>
                            <Badge className={getStatusStyle(asset.status)}>
                              {asset.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{asset.operationTime}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canAccount}
                              title={canAccount ? '折旧 / 减值 / 报损' : '只有会计可以登记资产处置'}
                              onClick={() => handleDepreciation(asset)}
                            >
                              折旧/减值/报损
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingAsset(asset)}
                            >
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandedRows.includes(asset.id) && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={9} className="p-4">
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <h4 className="font-medium mb-2">基本信息</h4>
                                  <div className="space-y-1 text-sm">
                                    <div><span className="text-muted-foreground">单价: </span>{formatCurrency(asset.unitPrice, asset.currencyType)}</div>
                                    <div><span className="text-muted-foreground">剩余价值: </span>{formatCurrency(asset.remainingValue, asset.currencyType)}</div>
                                    <div><span className="text-muted-foreground">描述: </span>{asset.description}</div>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="font-medium mb-2">审批信息</h4>
                                  <div className="space-y-1 text-sm">
                                    <div><span className="text-muted-foreground">提交人: </span>{asset.submitter}</div>
                                    <div><span className="text-muted-foreground">审批人: </span>{asset.approver}</div>
                                  </div>
                                </div>
                                <div>
                                  {asset.depreciationRecords.length > 0 ? (
                                    <>
                                      <h4 className="font-medium mb-2">处置记录</h4>
                                      <div className="space-y-2">
                                        {asset.depreciationRecords.map((record) => (
                                          <div key={record.id} className="p-2 bg-background border rounded-sm text-sm">
                                            <div className="flex justify-between">
                                              <span>
                                                <span className="text-muted-foreground mr-2">
                                                  {record.reasonText || '减值'}
                                                </span>
                                                {formatCurrency(record.amount)}
                                              </span>
                                              <span>{record.date}</span>
                                            </div>
                                            <div className="text-muted-foreground text-xs mt-1">{record.description}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="h-full flex items-center justify-center">
                                      <span className="text-muted-foreground text-sm">暂无处置记录</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
                
                {assets.length < total && (
                  <div className="mt-4 flex justify-center">
                    <LoadMoreButton 
                      onClick={handleLoadMore} 
                      isLoading={isLoadingMore}
                    />
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* 资产核销弹窗 */}
      <Dialog open={isDepreciationDialogOpen} onOpenChange={setIsDepreciationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>资产折旧 / 减值 / 报损</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            出售资产请走「申请收款 → 出售资产收入」，由流水自动冲减账面价值。
            这里处理不涉及现金的账面变动：折旧、减值、报损。系统不自动折旧，
            由会计按需登记；每一笔都永久保留。
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitDepreciation)} className="space-y-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>涉及数量</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value))}
                        min={1} 
                        max={selectedAsset?.quantity || 1}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>冲减金额</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value))}
                        min={0}
                        max={selectedAsset ? parseFloat(selectedAsset.remainingValue.toString()) : 0}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>处置原因</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="depreciation">折旧（正常损耗，按期分摊）</SelectItem>
                          <SelectItem value="impairment">减值（资产还在，但不值原价）</SelectItem>
                          <SelectItem value="writeoff">报损（资产灭失、报废）</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>说明</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="写清这次处置的缘由，将永久保留" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">确认登记</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingAsset !== null} onOpenChange={o => !o && setDeletingAsset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除资产？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除资产「{deletingAsset?.name}」及其全部核销记录，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteAsset}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const AssetRecords: React.FC = () => {
  return (
    <PageLayout title="资产记录" subtitle="管理和维护公司资产">
      <AssetRecordsContent />
    </PageLayout>
  );
};

export default AssetRecords;