import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Building, PlusCircle, Trash2, AlertTriangle, Edit, Save } from "lucide-react";
import { useAuth, Project, CreateProjectData } from "../contexts/AuthContext";
import { useToast } from "../hooks/use-toast";
import { useTranslation } from "react-i18next";
import { apiRequest, AUTH_API } from "../api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

// 项目创建表单组件
const CreateProjectForm: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [formData, setFormData] = useState<CreateProjectData>({
    name: '',
    code: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createProject } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证表单
    if (!formData.name.trim()) {
      toast({ 
        title: "请填写项目名称", 
        variant: "destructive" 
      });
      return;
    }
    
    if (!formData.code.trim()) {
      toast({ 
        title: "请填写项目代码", 
        variant: "destructive" 
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const newProject = await createProject(formData);
      
      if (newProject) {
        toast({
          title: "创建成功",
          description: `项目"${newProject.name}"已创建成功`
        });
        
        onClose();
      }
    } catch (error: any) {
      toast({
        title: "创建失败",
        description: error.message || "无法创建项目，请稍后重试",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">项目名称</Label>
          <Input
            id="name"
            name="name"
            placeholder="例如: 财务系统"
            value={formData.name}
            onChange={handleChange}
            disabled={isSubmitting}
            required
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="code">项目代码</Label>
          <Input
            id="code"
            name="code"
            placeholder="例如: finance"
            value={formData.code}
            onChange={handleChange}
            disabled={isSubmitting}
            required
          />
          <p className="text-sm text-muted-foreground">
            项目代码只能包含字母、数字和下划线，且必须唯一
          </p>
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="description">项目描述</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="请输入项目描述信息"
            value={formData.description}
            onChange={handleChange}
            disabled={isSubmitting}
            rows={3}
          />
        </div>
      </div>
      
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
          取消
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "创建中..." : "创建项目"}
        </Button>
      </DialogFooter>
    </form>
  );
};

// 项目编辑表单组件
const EditProjectForm: React.FC<{
  project: Project;
  onClose: () => void;
  onSuccess: (updatedProject: Project) => void;
}> = ({ project, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证表单
    if (!formData.name.trim()) {
      toast({ 
        title: "请填写项目名称", 
        variant: "destructive" 
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // 调用API更新项目
      const result = await apiRequest('PUT', `/api/projects/${project.id}`, formData);
      const updatedProject = result.data || result;

      toast({
        title: "更新成功",
        description: `项目"${updatedProject.name}"已更新成功`
      });

      onSuccess(updatedProject);
      onClose();
    } catch (error: any) {
      toast({
        title: "更新失败",
        description: error.message || "无法更新项目，请稍后重试",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">项目名称</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            disabled={isSubmitting}
            required
          />
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="code">项目代码</Label>
          <Input
            id="code"
            name="code"
            value={project.code}
            disabled={true}
            className="bg-muted"
          />
          <p className="text-sm text-muted-foreground">
            项目代码创建后不可修改
          </p>
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="description">项目描述</Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            disabled={isSubmitting}
            rows={3}
          />
        </div>
      </div>
      
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
          取消
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "保存中..." : "保存更改"}
        </Button>
      </DialogFooter>
    </form>
  );
};

const ProjectSwitcher: React.FC = () => {
  const { user, currentProject, availableProjects, switchProject, createProject, deleteProject } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  
  // 如果不是超级管理员，不显示项目切换器
  if (!user?.isSuperAdmin) {
    return null;
  }

  if (!availableProjects || availableProjects.length === 0) {
    // 尝试从服务器获取最新项目列表
    const refreshProjects = async () => {
      try {
        await apiRequest('GET', AUTH_API.USER);
      } catch (error) {
        // 获取失败静默处理
      }
    };
    
    // 触发刷新但不等待，避免阻塞渲染
    refreshProjects();
    return null;
  }
  
  const handleProjectChange = async (projectId: string) => {
    if (!projectId || projectId === (currentProject?.id.toString() || "")) {
      return;
    }

    const selectedProject = availableProjects.find(p => p.id.toString() === projectId);
    if (!selectedProject) {
      toast({ title: "项目切换失败", description: "项目不存在", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 统一交给 AuthContext.switchProject：它会调用后端接口、更新 Context 状态
      // 与 localStorage，并由 App 中按项目 id 设 key 的路由子树触发重新挂载。
      // 此处不再自行写 localStorage，也不再用 window.location 强制整页跳转。
      const success = await switchProject(selectedProject.id);
      if (!success) {
        toast({ title: "项目切换失败", description: "无法切换到指定项目", variant: "destructive" });
      }
    } catch (error: any) {
      console.error('项目切换失败:', error);
      toast({
        title: "项目切换失败",
        description: error?.message || "切换项目时发生错误",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (project: Project) => {
    // 不允许删除当前项目
    if (currentProject && project.id === currentProject.id) {
      toast({
        title: "无法删除",
        description: "不能删除当前正在使用的项目，请先切换到其他项目",
        variant: "destructive"
      });
      return;
    }
    
    // 不允许删除系统默认项目（演示项目，ID为2）
    if (project.id === 2) {
      toast({
        title: "无法删除",
        description: "系统默认项目不可删除",
        variant: "destructive"
      });
      return;
    }
    
    setProjectToDelete(project);
    setIsDeleteDialogOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    
    setIsLoading(true);
    
    try {
      const success = await deleteProject(projectToDelete.id);
      
      if (success) {
        toast({
          title: "删除成功",
          description: `项目"${projectToDelete.name}"已成功删除`
        });
        setIsManageDialogOpen(false); // 关闭管理窗口
      }
      // 失败提示由 deleteProject 内部统一弹出（那里拿得到服务端给的原因），
      // 这里再弹一次只会多出一条没有原因的重复提示
    } catch (error: any) {
      toast({
        title: "删除失败",
        description: error.message || "删除项目时发生错误",
        variant: "destructive"
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setProjectToDelete(null);
      setIsLoading(false);
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      {/* 项目切换器 */}
      <Select
        value={currentProject?.id.toString() || ""}
        onValueChange={handleProjectChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[180px] flex items-center gap-2">
          <Building className="h-4 w-4" />
          <SelectValue placeholder={t('project.selectProject')} />
        </SelectTrigger>
        <SelectContent>
          {availableProjects.map((project) => (
            <SelectItem key={project.id} value={project.id.toString()}>
              <span>{project.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* 项目管理按钮 - 点击弹出管理对话框 */}
      <Button 
        variant="outline"
        size="icon"
        className="h-9 w-9"
        title="管理项目"
        onClick={() => setIsManageDialogOpen(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="12" cy="5" r="1"></circle>
          <circle cx="12" cy="19" r="1"></circle>
        </svg>
      </Button>
      
      {/* 创建项目按钮 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-9 w-9"
            title="创建新项目"
          >
            <PlusCircle className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>创建新项目</DialogTitle>
            <DialogDescription>
              填写以下信息创建一个新的项目。项目创建后，您将自动成为该项目的管理员。
            </DialogDescription>
          </DialogHeader>
          <CreateProjectForm onClose={() => setIsCreateDialogOpen(false)} />
        </DialogContent>
      </Dialog>
      
      {/* 项目管理对话框 */}
      <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>项目管理</DialogTitle>
            <DialogDescription>
              管理您的项目。当前共有 {availableProjects.length} 个项目。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <h3 className="mb-2 font-medium">可管理项目列表</h3>
            <div className="border rounded-md divide-y">
              {availableProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">{project.description || '无描述'}</p>
                    <p className="text-xs text-muted-foreground">项目代码: {project.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 当前使用中标签 */}
                    {currentProject?.id === project.id && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">当前使用中</span>
                    )}
                    
                    {/* 编辑按钮 */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setProjectToEdit(project);
                        setIsEditDialogOpen(true);
                      }}
                      title="编辑项目"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      编辑
                    </Button>
                    
                    {/* 删除按钮 - 不能删除当前项目或演示项目 */}
                    {currentProject?.id !== project.id && (
                      project.id === 2 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={true}
                          title="系统默认项目不可删除"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          默认项目
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(project)}
                          title="删除项目"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              确认删除项目
            </AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除项目 <span className="font-bold">{projectToDelete?.name}</span> 吗？
              此操作不可撤销，项目中的所有数据将永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isLoading ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* 编辑项目对话框 */}
      <Dialog open={isEditDialogOpen && !!projectToEdit} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>
              修改项目信息。项目代码创建后不可更改。
            </DialogDescription>
          </DialogHeader>
          {projectToEdit && (
            <EditProjectForm 
              project={projectToEdit} 
              onClose={() => {
                setIsEditDialogOpen(false);
                setProjectToEdit(null);
              }}
              onSuccess={(updatedProject) => {
                // 更新本地项目列表中的项目数据
                const updatedProjects = availableProjects.map(p => 
                  p.id === updatedProject.id ? updatedProject : p
                );
                // 这里假设AuthContext提供了更新项目列表的方法
                // 如果没有这个方法，则需要刷新页面或重新获取项目列表
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectSwitcher;