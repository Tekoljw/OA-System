import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useIsMobile } from "../../hooks/use-mobile";
import { Calendar, FileText, Building, CreditCard, Tag, FileQuestion, CheckCircle2 } from "lucide-react";
import ImageViewer from "../common/ImageViewer";
import ApprovalDialog from "./ApprovalDialog";
import { approveApplication } from "../../utils/approval-api";
import { useToast } from "../../hooks/use-toast";
import { apiRequest } from "../../api/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type Application = {
  id: number;
  type: string;
  title: string;
  amount: number;
  status: string;
  date: string;
  department: string;
  description?: string; // 添加可选的备注说明字段
  content?: string; // 兼容后端返回的content字段
  images?: string[]; // 添加可选的图片数组字段
};

interface ApplicationListProps {
  applications: Application[];
  type: string;
  onRefresh?: () => void; // 添加可选的刷新回调函数
}

const ApplicationList: React.FC<ApplicationListProps> = ({ applications, type, onRefresh }) => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);

  // 归账：需指定入账账户与科目
  const [allocateTarget, setAllocateTarget] = useState<Application | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [allocAccountId, setAllocAccountId] = useState("");
  const [allocSubjectId, setAllocSubjectId] = useState("");
  const [busy, setBusy] = useState(false);

  // Status badge color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case "to_be_allocated":
      case "ready_for_execution":
        return "bg-orange-100 text-orange-800";
      case "to_be_executed":
        return "bg-indigo-100 text-indigo-800";
      case "approved":
      case "completed":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "ready_for_execution":
        return "bg-blue-100 text-blue-800";
      case "pending":
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  // Status text mapping
  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "已批准";
      case "rejected":
        return "已拒绝";
      case "ready_for_execution":
      case "to_be_allocated":
        return "待归账";
      case "to_be_executed":
        return "待执行";
      case "completed":
        return "已完成";
      case "cancelled":
        return "已取消";
      case "pending":
      default:
        return "待审批";
    }
  };

  // Type mapping for Chinese display
  const getTypeText = (type: string) => {
    switch (type) {
      case "payment":
        return "付款申请";
      case "income":
        return "收入申请";
      case "transfer":
        return "内部划转";
      case "loan":
        return "借贷申请";
      case "investment":
        return "投资申请";
      case "purchase":
        return "采购申请";
      case "sales":
        return "销售申请";
      case "borrowing":
        return "借入申请";
      case "lending":
        return "借出申请";
      default:
        return type;
    }
  };

  // 应用类型对应的色彩
  const getTypeColor = (type: string) => {
    switch (type) {
      case "payment":
        return "bg-blue-100 text-blue-800";
      case "income": 
        return "bg-green-100 text-green-800";
      case "transfer":
        return "bg-purple-100 text-purple-800";
      case "loan":
        return "bg-orange-100 text-orange-800";
      case "investment":
        return "bg-indigo-100 text-indigo-800";
      case "purchase":
        return "bg-cyan-100 text-cyan-800";
      case "sales":
        return "bg-emerald-100 text-emerald-800";
      case "borrowing":
        return "bg-amber-100 text-amber-800";
      case "lending":
        return "bg-rose-100 text-rose-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // 生成唯一的应用ID，确保不同的列表不会有重复键
  const getApplicationKey = (app: Application) => {
    // 使用列表类型作为前缀，确保不同列表中的相同ID不会冲突
    return `${type}-${app.id}`;
  };
  
  // 打开审批对话框
  const handleApproval = (app: Application, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发行点击事件
    setSelectedApplication(app);
    setApprovalDialogOpen(true);
  };
  
  // 打开归账对话框：此前待归账页没有任何操作入口，流程到这里就断了
  const handleAllocate = async (app: Application, e: React.MouseEvent) => {
    e.stopPropagation();
    setAllocateTarget(app);
    setAllocAccountId("");
    setAllocSubjectId("");
    try {
      const [accRes, subRes] = await Promise.all([
        apiRequest('GET', '/api/accounts?limit=200'),
        apiRequest('GET', '/api/subjects'),
      ]);
      // 账户币种必须与申请单一致：否则 100 USD 会原样记成 100 CNY，
      // 后端也会拒绝，这里先过滤掉，免得选了才报错
      const appCurrency = (app as any).currency || (app as any).currencyType || 'CNY';
      const allAccounts = Array.isArray(accRes?.data) ? accRes.data : [];
      setAccounts(allAccounts.filter((a: any) => (a.currency_type || a.currencyType) === appCurrency));

      // 科目池按一级流水类型分，只列本申请所属类型下的科目
      const ttCode = (app as any).transactionTypeCode;
      const allSubjects = Array.isArray(subRes?.data) ? subRes.data : [];
      setSubjects(ttCode
        ? allSubjects.filter((x: any) => x.transaction_type_code === ttCode)
        : allSubjects.filter((x: any) => x.type === (app.type === 'income' ? 'income' : 'expense')));
    } catch {
      setAccounts([]); setSubjects([]);
    }
  };

  const submitAllocate = async () => {
    if (!allocateTarget || !allocAccountId) {
      toast({ title: "请选择入账账户", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest('PUT', `/api/applications/${allocateTarget.id}/allocate`, {
        account_id: Number(allocAccountId),
        subject_id: allocSubjectId ? Number(allocSubjectId) : undefined,
      });
      if (!res?.success) throw new Error(res?.message || '归账失败');
      toast({ title: "归账成功", description: "已转入待执行" });
      setAllocateTarget(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast({ title: "归账失败", description: err?.message || '请稍后重试', variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // 执行：生成流水并变动账户余额，是唯一动账的一步
  const handleExecute = async (app: Application, e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await apiRequest('PUT', `/api/applications/${app.id}/execute`, {});
      if (!res?.success) throw new Error(res?.message || '执行失败');
      toast({ title: "执行成功", description: "已生成流水并更新账户余额" });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast({ title: "执行失败", description: err?.message || '请稍后重试', variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // 处理同意审批
  const handleApprove = async (id: number, comment: string) => {
    try {
      await approveApplication(id, 'approved', comment);
      toast({
        title: "审批成功",
        description: "申请已批准并转为待归账状态",
      });
      if (onRefresh) onRefresh(); // 刷新数据
    } catch (error) {
      console.error("审批失败:", error);
      toast({
        title: "审批失败",
        description: "操作失败，请稍后重试",
        variant: "destructive",
      });
      throw error; // 向上传递错误以便ApprovalDialog组件处理
    }
  };
  
  // 处理拒绝审批
  const handleReject = async (id: number, comment: string) => {
    try {
      await approveApplication(id, 'rejected', comment);
      toast({
        title: "审批完成",
        description: "申请已被拒绝",
      });
      if (onRefresh) onRefresh(); // 刷新数据
    } catch (error) {
      console.error("拒绝失败:", error);
      toast({
        title: "操作失败",
        description: "拒绝申请操作失败，请稍后重试",
        variant: "destructive",
      });
      throw error; // 向上传递错误以便ApprovalDialog组件处理
    }
  };

  // 无数据时显示的组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <FileQuestion className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无{type}记录
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          当有新的{type}记录时，将会显示在这里
        </p>
      </div>
    </Card>
  );

  if (isMobile) {
    return (
      <div className="grid gap-4">
        {applications.length === 0 ? (
          <NoDataDisplay />
        ) : (
          applications.map((app) => (
            <Card key={getApplicationKey(app)} className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors">
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base font-medium">{app.title}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      APP-{app.id.toString().padStart(4, '0')}
                    </div>
                  </div>
                  <Badge className={getStatusColor(app.status)}>
                    {getStatusText(app.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <Badge variant="outline" className={getTypeColor(app.type)}>
                        {(app as any).transactionTypeName || getTypeText(app.type)}
                      </Badge>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      ¥{app.amount.toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{app.department}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{app.date}</span>
                  </div>
                  
                  {/* 显示备注信息 */}
                  {(app.description || app.content) && (
                    <div className="col-span-2 mt-2 pt-2 border-t">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm text-muted-foreground">
                          {app.description || app.content}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* 底部操作区域 */}
                  <div className="col-span-2 flex justify-between items-center mt-2 pt-2 border-t">
                    <ImageViewer 
                      images={app.images || []} 
                      iconSize={16}
                    />
                    
                    {/* 立即审批按钮 - 移动端 */}
                    {app.status === "pending" && type === "待审批" && (
                      <Button 
                        size="sm" 
                        onClick={(e) => handleApproval(app, e)}
                        className="ml-auto"
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        立即审批
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      <Card>
        <CardContent className="p-0">
          {applications.length === 0 ? (
            <NoDataDisplay />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>申请编号</TableHead>
                    <TableHead>申请类型</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead>金额 (¥)</TableHead>
                    <TableHead>申请部门</TableHead>
                    <TableHead>申请日期</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>备注说明</TableHead>
                    <TableHead className="w-10">附件</TableHead>
                    {["待审批", "待归账", "待执行"].includes(type) &&
                      <TableHead className="text-center">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={getApplicationKey(app)} className="cursor-pointer hover:bg-muted/80">
                      <TableCell className="font-medium">APP-{app.id.toString().padStart(4, '0')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getTypeColor(app.type)}>
                          {/* 优先显示一级流水类型，比 income/expense 具体 */}
                          {(app as any).transactionTypeName || getTypeText(app.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>{app.title}</TableCell>
                      <TableCell>{app.amount.toLocaleString('zh-CN')}</TableCell>
                      <TableCell>{app.department}</TableCell>
                      <TableCell>{app.date}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(app.status)}>
                          {getStatusText(app.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {app.description || app.content || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <ImageViewer 
                          images={app.images || []} 
                          iconSize={16}
                        />
                      </TableCell>
                      {["待审批", "待归账", "待执行"].includes(type) && (
                        <TableCell className="text-center">
                          {type === "待审批" && app.status === "pending" && (
                            <Button size="sm" onClick={(e) => handleApproval(app, e)}>
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              立即审批
                            </Button>
                          )}
                          {/* 待归账与待执行此前没有任何操作入口，流程走到这里就断了 */}
                          {type === "待归账" && ["to_be_allocated", "ready_for_execution", "approved"].includes(app.status) && (
                            <Button size="sm" onClick={(e) => handleAllocate(app, e)}>
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              归账
                            </Button>
                          )}
                          {type === "待执行" && ["to_be_executed", "to_be_allocated"].includes(app.status) && (
                            <Button size="sm" onClick={(e) => handleExecute(app, e)}>
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              执行
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* 归账对话框 */}
      <Dialog open={allocateTarget !== null} onOpenChange={o => !o && setAllocateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>归账</DialogTitle>
            <DialogDescription>
              为「{allocateTarget?.title}」指定入账账户与科目，确认后转入待执行。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>入账账户 *</Label>
              <Select value={allocAccountId} onValueChange={setAllocAccountId}>
                <SelectTrigger><SelectValue placeholder="请选择账户" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}（{a.currency_type}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>科目</Label>
              <Select value={allocSubjectId} onValueChange={setAllocSubjectId}>
                <SelectTrigger><SelectValue placeholder="请选择科目" /></SelectTrigger>
                <SelectContent>
                  {subjects.map(x => (
                    <SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocateTarget(null)}>取消</Button>
            <Button onClick={submitAllocate} disabled={busy}>确认归账</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 审批对话框 */}
      {selectedApplication && (
        <ApprovalDialog
          isOpen={approvalDialogOpen}
          onClose={() => setApprovalDialogOpen(false)}
          applicationId={selectedApplication.id}
          applicationTitle={selectedApplication.title}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
};

export default ApplicationList;
