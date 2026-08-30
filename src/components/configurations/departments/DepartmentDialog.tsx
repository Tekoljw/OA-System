
import React, { useEffect, useState } from "react";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Plus, Edit, User, AlertTriangle } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectTrigger, 
  SelectValue 
} from "../../ui/select";
import { getManagerUsers } from "../../../utils/api";
import { apiRequest } from "../../../api/client";
import { useToast } from "../../../hooks/use-toast";
import { Skeleton } from "../../ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";

interface Manager {
  id: string | number;
  username: string;
  fullName: string;
  role: string;
}

interface DepartmentDialogProps {
  department?: {
    id: number;
    name: string;
    manager: string;
  };
  onSaved?: () => void; // 添加保存成功后的回调函数
}

export function DepartmentDialog({ department, onSaved }: DepartmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(department?.name || "");
  const [selectedManagerId, setSelectedManagerId] = useState<string>("");
  const [managers, setManagers] = useState<Manager[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const { toast } = useToast();
  
  // 获取当前项目ID
  useEffect(() => {
    try {
      const projectDataStr = localStorage.getItem('currentProject');
      if (projectDataStr) {
        const projectData = JSON.parse(projectDataStr);
        if (projectData && projectData.id) {
          setCurrentProjectId(projectData.id);
          console.log('DepartmentDialog: 从localStorage获取到当前项目ID:', projectData.id);
        }
      }
      
      // 如果没有从localStorage获取到，尝试从user对象获取
      if (!currentProjectId) {
        const userDataStr = localStorage.getItem('user');
        if (userDataStr) {
          try {
            const userData = JSON.parse(userDataStr);
            if (userData.currentProject?.id) {
              setCurrentProjectId(userData.currentProject.id);
              console.log('DepartmentDialog: 从user.currentProject获取到项目ID:', userData.currentProject.id);
            } else if (userData.projectId) {
              setCurrentProjectId(userData.projectId);
              console.log('DepartmentDialog: 从user.projectId获取到项目ID:', userData.projectId);
            }
          } catch (e) {
            console.error('解析用户数据失败:', e);
          }
        }
      }
    } catch (e) {
      console.error('解析当前项目数据失败:', e);
    }
  }, []);

  // 获取管理者列表
  useEffect(() => {
    if (open) {
      fetchManagers();
    }
  }, [open]);

  // 初始化选中的管理者（当编辑现有部门时）
  useEffect(() => {
    if (department && managers.length > 0) {
      // 尝试通过姓名匹配部门主管（这里的逻辑可能需要按实际情况调整）
      const foundManager = managers.find(m => 
        m.fullName === department.manager || m.username === department.manager
      );
      
      if (foundManager) {
        setSelectedManagerId(String(foundManager.id));
      }
    }
  }, [department, managers]);

  const fetchManagers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const projectData = localStorage.getItem('currentProject');
      const projectId = projectData ? JSON.parse(projectData).id : 1;
      const response = await fetch(`/api/users?projectId=${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        const managers = data.data.map((u: any) => ({
          id: u.id,
          name: u.full_name || u.username,
          username: u.username,
        }));
        setManagers(managers);
      } else {
        throw new Error(data.error?.message || '管理者数据格式错误');
      }
    } catch (err: any) {
      console.error('获取管理者列表失败:', err);
      setError(err.message || '获取管理者列表出错');
      toast({
        title: "获取管理者失败",
        description: err.message || '无法获取管理者列表',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "验证错误",
        description: "部门名称不能为空",
        variant: "destructive",
      });
      return;
    }
    
    // 确保有项目ID
    if (!currentProjectId) {
      toast({
        title: "验证错误",
        description: "无法确定当前项目",
        variant: "destructive",
      });
      return;
    }
    
    // 准备部门数据
    let departmentData: any = { 
      name,
      projectId: currentProjectId // 添加项目ID到请求数据
    };
    
    console.log(`准备创建项目 ${currentProjectId} 的部门: ${name}`);
    
    // 如果选择了部门主管，添加相关信息
    if (selectedManagerId) {
      // 获取选中主管的完整信息
      const selectedManager = managers.find(m => String(m.id) === selectedManagerId);
      
      if (selectedManager) {
        departmentData.managerId = selectedManagerId;
        departmentData.managerName = selectedManager.fullName;
        departmentData.managerUsername = selectedManager.username;
      }
    }
    
    try {
      // 此前新建部门只写入 localStorage 的 newDepartments、编辑分支甚至什么都不做，
      // 界面却提示「已创建/已更新」。结果是部门只存在于当前浏览器：他人看不到、
      // 清缓存即丢失，而审批流依赖的部门主管在库中根本不存在。改为真正调用接口。
      const payload: any = { name: departmentData.name };
      if (departmentData.managerId !== undefined) {
        payload.managerId = departmentData.managerId ? Number(departmentData.managerId) : null;
      }

      const res = department
        ? await apiRequest('PUT', `/api/departments/${department.id}?projectId=${currentProjectId}`, payload)
        : await apiRequest('POST', `/api/departments?projectId=${currentProjectId}`, payload);

      if (!res?.success) {
        throw new Error(res?.message || '无法保存部门数据');
      }

      setName('');
      setSelectedManagerId('');
      setOpen(false);

      toast({
        title: department ? "部门已更新" : "部门已创建",
        description: `${name} 部门已成功${department ? "更新" : "创建"}`,
      });

      if (onSaved) {
        onSaved();
      }

    } catch (error: any) {
      console.error('部门操作错误:', error);
      toast({
        title: "操作失败",
        description: error.message || '无法保存部门数据',
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {department ? (
          <Button variant="ghost" size="icon">
            <Edit className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            添加部门
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {department ? "编辑部门" : "添加新部门"}
          </DialogTitle>
          <DialogDescription>
            填写部门信息，并可以选择性地指定部门主管（可选）
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">部门名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入部门名称"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="manager">部门主管（可选）</Label>
              
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>无法选择部门主管</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : managers.length === 0 ? (
                <div className="text-sm text-muted-foreground p-2 border border-dashed rounded-md bg-muted/20">
                  当前没有可选择的部门主管用户。您可以先创建部门，稍后再分配部门主管。
                </div>
              ) : (
                <Select 
                  value={selectedManagerId} 
                  onValueChange={setSelectedManagerId}
                >
                  <SelectTrigger id="manager">
                    <SelectValue placeholder="选择部门主管" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>选择部门主管</SelectLabel>
                      {managers.map((manager) => (
                        <SelectItem key={manager.id} value={String(manager.id)}>
                          <div className="flex items-center">
                            <User className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span>{manager.fullName}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({manager.role})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button type="submit" disabled={isLoading || !!error}>
              {department ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
