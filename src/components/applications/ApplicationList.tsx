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

  // Status badge color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
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
        return "待执行";
      case "completed":
        return "已完成";
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
                        {getTypeText(app.type)}
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
                    {type === "待审批" && <TableHead className="text-center">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={getApplicationKey(app)} className="cursor-pointer hover:bg-muted/80">
                      <TableCell className="font-medium">APP-{app.id.toString().padStart(4, '0')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getTypeColor(app.type)}>
                          {getTypeText(app.type)}
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
                      {type === "待审批" && (
                        <TableCell className="text-center">
                          {app.status === "pending" && (
                            <Button 
                              size="sm" 
                              onClick={(e) => handleApproval(app, e)}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              立即审批
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
