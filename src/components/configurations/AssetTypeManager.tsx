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
  AssetType, 
  getAssetTypes, 
  createAssetType, 
  updateAssetType, 
  deleteAssetType 
} from "../../utils/config-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import LoadingState from "../common/LoadingState";
import EmptyState from "../common/EmptyState";

const AssetTypeManager = () => {
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingAssetType, setEditingAssetType] = useState<AssetType | null>(null);
  const [deletingAssetTypeId, setDeletingAssetTypeId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    description: "", 
    depreciationRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // 获取资产分类数据
  useEffect(() => {
    const fetchAssetTypes = async () => {
      try {
        setIsLoading(true);
        const data = await getAssetTypes();
        if (data && Array.isArray(data)) {
          // 检查是否有新创建的资产分类在localStorage中
          const newAssetTypes = JSON.parse(localStorage.getItem('newAssetTypes') || '[]');
          if (newAssetTypes.length > 0) {
            // 合并新资产分类到现有列表
            const allAssetTypes = [...data, ...newAssetTypes];
            setAssetTypes(allAssetTypes);
            console.log('合并新创建的资产分类:', allAssetTypes);
          } else {
            setAssetTypes(data);
          }
        } else {
          setAssetTypes([]);
          toast({
            title: "数据获取提示",
            description: "未能获取资产分类数据或数据为空",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("获取资产分类列表失败:", error);
        setAssetTypes([]);
        
        toast({
          title: "连接失败",
          description: "无法连接到服务器获取资产分类数据，请稍后重试",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssetTypes();
  }, [toast]);

  const handleAdd = () => {
    setEditingAssetType(null);
    setFormData({ 
      name: "", 
      description: "", 
      depreciationRate: 10,
      });
    setIsDialogOpen(true);
  };

  const handleEdit = (assetType: AssetType) => {
    setEditingAssetType(assetType);
    setFormData({ 
      name: assetType.name, 
      description: assetType.description,
      depreciationRate: assetType.depreciationRate,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingAssetTypeId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleFormChange = (field: string, value: any) => {
    if (field === "depreciationRate") {
      // 确保折旧率是一个数字，且在0-100之间
      const rate = parseFloat(value);
      if (isNaN(rate)) return;
      value = Math.min(Math.max(rate, 0), 100);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAssetTypeId) return;
    
    try {
      setIsSubmitting(true);
      await deleteAssetType(deletingAssetTypeId);
      
      // 更新本地状态
      setAssetTypes(assetTypes.filter(t => t.id !== deletingAssetTypeId));
      
      toast({
        title: "删除成功",
        description: "资产分类已成功删除",
      });
    } catch (error: any) {
      console.error("删除资产分类失败:", error);
      toast({
        variant: "destructive",
        title: "删除失败",
        description: error.message || "无法删除资产分类，请稍后再试",
      });
    } finally {
      setIsSubmitting(false);
      setIsDeleteDialogOpen(false);
      setDeletingAssetTypeId(null);
    }
  };

  const handleSubmit = async () => {
    // 表单验证
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "信息不完整",
        description: "请输入资产分类名称",
      });
      return;
    }

    if (formData.depreciationRate < 0 || formData.depreciationRate > 100) {
      toast({
        variant: "destructive",
        title: "折旧率无效",
        description: "折旧率必须在0到100之间",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (editingAssetType) {
        // 更新已有资产分类
        const updatedAssetType = await updateAssetType(editingAssetType.id, formData);
        
        // 更新本地状态
        setAssetTypes(assetTypes.map(t => t.id === editingAssetType.id ? updatedAssetType : t));
        
        toast({
          title: "更新成功",
          description: "资产分类已更新",
        });
      } else {
        // 创建新资产分类
        const newAssetType = await createAssetType(formData);
        
        // 更新本地状态
        setAssetTypes([...assetTypes, newAssetType]);
        
        toast({
          title: "添加成功",
          description: "新资产分类已添加",
        });
      }
    } catch (error: any) {
      console.error("操作资产分类失败:", error);
      toast({
        variant: "destructive",
        title: "操作失败",
        description: error.message || "操作资产分类失败，请稍后再试",
      });
    } finally {
      setIsSubmitting(false);
      setIsDialogOpen(false);
    }
  };

  const isMobile = useIsMobile();
  
  // 加载状态
  if (isLoading) {
    return <LoadingState title="加载资产分类中..." />;
  }
  
  // 无数据状态
  if (assetTypes.length === 0) {
    return (
      <EmptyState 
        title="暂无资产分类数据" 
        description="添加资产分类以管理不同类型的资产"
        icon={<FileQuestion className="h-12 w-12" />}
        action={
          <Button onClick={handleAdd} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            添加资产分类
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Button onClick={handleAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          添加
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-4">
          {assetTypes.map(assetType => (
            <Card key={assetType.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{assetType.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{assetType.description}</p>
                    <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center">
                        <span className="inline-block w-20">折旧率:</span>
                        <span>{assetType.depreciationRate}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" aria-label="编辑资产分类"
                            onClick={() => handleEdit(assetType)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="删除资产分类"
                            onClick={() => handleDelete(assetType.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>折旧率</TableHead>
                <TableHead className="hidden md:table-cell">描述</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetTypes.map(assetType => (
                <TableRow key={assetType.id}>
                  <TableCell className="font-medium">{assetType.name}</TableCell>
                  <TableCell>{assetType.depreciationRate}%</TableCell>
                  <TableCell className="hidden md:table-cell">{assetType.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {/* 资产分类允许自由增删改。原先按 id > 4 判定「系统默认」而锁死，
                          是把种子数据的 id 当成了业务规则 */}
                      <Button variant="ghost" size="icon" aria-label="编辑资产分类"
                              onClick={() => handleEdit(assetType)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="删除资产分类"
                              onClick={() => handleDelete(assetType.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 添加/编辑对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAssetType ? "编辑资产分类" : "添加资产分类"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                名称 <span className="text-red-500">*</span>
              </label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => handleFormChange("name", e.target.value)}
                placeholder="输入资产分类名称"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="depreciationRate" className="text-sm font-medium">
                折旧率(%) <span className="text-red-500">*</span>
              </label>
              <Input
                id="depreciationRate"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={formData.depreciationRate}
                onChange={e => handleFormChange("depreciationRate", e.target.value)}
                placeholder="输入折旧率（0-100）"
              />
              <p className="text-xs text-muted-foreground">
                供会计参考的年折旧比例。系统不会自动折旧 ——
                资产账面价值只在出售（走流水）或会计手工报损/减值时才变动
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                描述
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => handleFormChange("description", e.target.value)}
                placeholder="输入资产分类描述"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                editingAssetType ? "更新" : "添加"
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
              <p className="mb-2">确定要删除此资产分类吗？此操作无法撤销。</p>
              <p className="font-semibold text-destructive">注意：已被资产记录引用的分类无法删除，需先处理相关资产。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isSubmitting}
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

export default AssetTypeManager;