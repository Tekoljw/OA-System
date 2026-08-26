
import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Plus, Edit, Trash2, FileQuestion, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { Card, CardContent } from "../ui/card";
import { useIsMobile } from "../../hooks/use-mobile";
import { 
  AccountType, 
  getAccountTypes, 
  createAccountType, 
  updateAccountType, 
  deleteAccountType 
} from "../../utils/config-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";

const AccountTypeManager = () => {
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<AccountType | null>(null);
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // 获取账户类型数据
  useEffect(() => {
    const fetchAccountTypes = async () => {
      try {
        setIsLoading(true);
        const data = await getAccountTypes();
        setAccountTypes(data);
      } catch (error) {
        console.error("获取账户类型列表失败:", error);
        toast({
          variant: "destructive",
          title: "获取账户类型列表失败",
          description: "请稍后再试或联系管理员",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountTypes();
  }, [toast]);

  const handleAdd = () => {
    setEditingType(null);
    setFormData({ name: "", description: "" });
    setIsDialogOpen(true);
  };

  const handleEdit = (type: AccountType) => {
    setEditingType(type);
    setFormData({ 
      name: type.name,
      description: type.description || ""
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingTypeId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTypeId) return;
    
    try {
      setIsSubmitting(true);
      await deleteAccountType(deletingTypeId);
      setAccountTypes(accountTypes.filter(t => t.id !== deletingTypeId));
      toast({
        description: "账户类型已删除",
      });
    } catch (error: any) {
      console.error("删除账户类型失败:", error);
      toast({
        variant: "destructive",
        title: "删除账户类型失败",
        description: error.message || "可能有账户正在使用此类型，无法删除",
      });
    } finally {
      setIsSubmitting(false);
      setIsDeleteDialogOpen(false);
      setDeletingTypeId(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({
        variant: "destructive",
        description: "账户类型名称不能为空",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (editingType) {
        // 更新账户类型
        const updated = await updateAccountType(editingType.id, {
          name: formData.name,
          description: formData.description
        });
        
        setAccountTypes(accountTypes.map(t => 
          t.id === editingType.id ? updated : t
        ));
        
        toast({
          description: "账户类型已更新",
        });
      } else {
        // 创建账户类型
        const newType = await createAccountType({
          name: formData.name,
          description: formData.description
        });
        
        setAccountTypes([...accountTypes, newType]);
        
        toast({
          description: "新账户类型已添加",
        });
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("保存账户类型失败:", error);
      toast({
        variant: "destructive",
        title: "保存账户类型失败",
        description: error.message || "请稍后再试或联系管理员",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMobile = useIsMobile();
  
  // 无数据时显示的组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <FileQuestion className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无账户类型数据
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          添加账户类型以管理不同的账户分类
        </p>
      </div>
    </Card>
  );

  // 加载中显示
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-start mb-4">
        <Button onClick={handleAdd}><Plus className="mr-2" />添加账户类型</Button>
      </div>

      {accountTypes.length === 0 ? (
        <NoDataDisplay />
      ) : (
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="grid gap-4 p-4">
                {accountTypes.map((type) => (
                  <Card key={type.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{type.name}</div>
                          {type.description && (
                            <div className="text-sm text-muted-foreground">{type.description}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(type)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(type.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>账户类型名称</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead className="w-[100px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountTypes.map((type) => (
                    <TableRow key={type.id} className="hover:bg-muted/50 cursor-pointer">
                      <TableCell>{type.name}</TableCell>
                      <TableCell className="text-muted-foreground">{type.description || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(type)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(type.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 编辑/添加对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "编辑账户类型" : "添加账户类型"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label>类型名称</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label>描述</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDialogOpen(false)} variant="outline" disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                editingType ? "更新" : "添加"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除此账户类型吗？已关联的账户可能会受到影响。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountTypeManager;
