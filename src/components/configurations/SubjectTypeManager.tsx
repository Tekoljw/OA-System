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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useToast } from "../../hooks/use-toast";
import { Card, CardContent } from "../ui/card";
import { useIsMobile } from "../../hooks/use-mobile";
import { 
  SubjectType, 
  getSubjectTypes, 
  createSubjectType, 
  updateSubjectType, 
  deleteSubjectType 
} from "../../utils/config-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import LoadingState from "../common/LoadingState";
import EmptyState from "../common/EmptyState";

interface SubjectTypeManagerProps {
  category?: '收入' | '支出';
  filterByCategory?: boolean;
}

const SubjectTypeManager: React.FC<SubjectTypeManagerProps> = ({ 
  category = '收入',
  filterByCategory = true 
}) => {
  const [subjects, setSubjects] = useState<SubjectType[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectType | null>(null);
  const [deletingSubjectId, setDeletingSubjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    description: "", 
    category: category 
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // 获取科目分类数据
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        setIsLoading(true);
        const data = await getSubjectTypes();
        
        // 如果API返回有效数据
        if (data && Array.isArray(data)) {
          // 如果需要按分类过滤
          if (filterByCategory) {
            setSubjects(data.filter(subject => subject.category === category));
          } else {
            setSubjects(data);
          }
          
          if (data.length === 0) {
            toast({
              title: "数据获取提示",
              description: "未找到科目分类数据",
              variant: "default",
            });
          }
        } else {
          // API 返回了无效数据结构
          setSubjects([]);
          toast({
            title: "数据获取提示",
            description: "科目分类数据格式有误",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("获取科目分类列表失败:", error);
        
        // 设置空数组，不使用离线数据
        setSubjects([]);
        
        toast({
          title: "连接失败",
          description: "无法连接到服务器获取科目分类数据，请稍后重试",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubjects();
  }, [toast, category, filterByCategory]);

  const handleAdd = () => {
    setEditingSubject(null);
    setFormData({ name: "", description: "", category: category });
    setIsDialogOpen(true);
  };

  const handleEdit = (subject: SubjectType) => {
    setEditingSubject(subject);
    setFormData({ 
      name: subject.name, 
      description: subject.description,
      category: subject.category 
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingSubjectId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSubjectId) return;
    
    try {
      setIsSubmitting(true);
      await deleteSubjectType(deletingSubjectId);
      
      // 更新本地状态
      setSubjects(subjects.filter(s => s.id !== deletingSubjectId));
      
      toast({
        title: "删除成功",
        description: "科目分类已成功删除",
      });
    } catch (error: any) {
      console.error("删除科目分类失败:", error);
      toast({
        variant: "destructive",
        title: "删除失败",
        description: error.message || "无法删除科目分类，请稍后再试",
      });
    } finally {
      setIsSubmitting(false);
      setIsDeleteDialogOpen(false);
      setDeletingSubjectId(null);
    }
  };

  const handleSubmit = async () => {
    // 表单验证
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "信息不完整",
        description: "请输入科目分类名称",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (editingSubject) {
        // 更新已有科目分类
        const updatedSubject = await updateSubjectType(editingSubject.id, formData);
        
        // 更新本地状态
        setSubjects(subjects.map(s => s.id === editingSubject.id ? updatedSubject : s));
        
        toast({
          title: "更新成功",
          description: "科目分类已更新",
        });
      } else {
        // 创建新科目分类
        const newSubject = await createSubjectType(formData);
        
        // 更新本地状态
        setSubjects([...subjects, newSubject]);
        
        toast({
          title: "添加成功",
          description: "新科目分类已添加",
        });
      }
    } catch (error: any) {
      console.error("操作科目分类失败:", error);
      toast({
        variant: "destructive",
        title: "操作失败",
        description: error.message || "操作科目分类失败，请稍后再试",
      });
    } finally {
      setIsSubmitting(false);
      setIsDialogOpen(false);
    }
  };

  const isMobile = useIsMobile();
  
  // 加载状态
  if (isLoading) {
    return <LoadingState title="加载科目分类中..." />;
  }
  
  // 无数据状态
  if (subjects.length === 0) {
    return (
      <EmptyState 
        title="暂无科目分类数据" 
        description={`添加${category}科目分类以管理不同的${category}类型`}
        icon={<FileQuestion className="h-12 w-12" />}
        action={
          <Button onClick={handleAdd} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            添加科目分类
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
          {subjects.map(subject => (
            <Card key={subject.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{subject.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{subject.description}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                        subject.category === '收入' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {subject.category}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {/* 只对非系统默认分类（ID大于5的分类）显示编辑和删除按钮 */}
                    {parseInt(subject.id) > 5 ? (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(subject)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(subject.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">系统默认</span>
                    )}
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
                <TableHead>分类</TableHead>
                <TableHead className="hidden md:table-cell">描述</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map(subject => (
                <TableRow key={subject.id}>
                  <TableCell className="font-medium">{subject.name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                      subject.category === '收入' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {subject.category}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{subject.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {/* 只对非系统默认分类（ID大于5的分类）显示编辑和删除按钮 */}
                      {parseInt(subject.id) > 5 ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(subject)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(subject.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">系统默认</span>
                      )}
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
            <DialogTitle>{editingSubject ? "编辑科目分类" : "添加科目分类"}</DialogTitle>
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
                placeholder="输入科目分类名称"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="category" className="text-sm font-medium">
                分类 <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.category}
                onValueChange={value => handleFormChange("category", value)}
                disabled={filterByCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="收入">收入</SelectItem>
                  <SelectItem value="支出">支出</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                描述
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => handleFormChange("description", e.target.value)}
                placeholder="输入科目分类描述"
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
                editingSubject ? "更新" : "添加"
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
              <p className="mb-2">确定要删除此科目分类吗？此操作无法撤销。</p>
              <p className="font-semibold text-destructive">注意：如果此科目分类为系统默认科目，删除操作将失败。</p>
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

export default SubjectTypeManager;