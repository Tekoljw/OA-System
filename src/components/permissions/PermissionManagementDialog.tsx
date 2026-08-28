
import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import { Plus, Edit, Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Input } from "../ui/input";
import * as z from "zod";
import { useToast } from "../../hooks/use-toast";
import { Role, Permission, PermissionKey } from "../../types/permission";
import { PermissionList } from "./PermissionList";

const roleFormSchema = z.object({
  name: z.string().min(2, "Role name must be at least 2 characters"),
  description: z.string().optional(),
});

interface Props {
  role?: Role;
  onSaved?: () => void; // 添加保存成功后的回调函数
}

export function PermissionManagementDialog({ role, onSaved }: Props) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [permissions, setPermissions] = React.useState<Permission[]>([]);
  const { toast } = useToast();
  const [selectedPermissions, setSelectedPermissions] = React.useState<PermissionKey[]>(
    role?.permissions || []
  );

  const form = useForm<z.infer<typeof roleFormSchema>>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name || "",
      description: role?.description || "",
    },
  });

  // 从服务器获取最新的权限列表
  useEffect(() => {
    if (dialogOpen) {
      fetchPermissions();
    }
  }, [dialogOpen]);

  const fetchPermissions = async () => {
    setIsLoading(true);
    try {
      // 系统预定义权限列表
      const predefinedPermissions: Permission[] = [
        { id: '1', name: '查看仪表盘', description: '查看财务仪表盘和统计数据', key: 'view_dashboard' },
        { id: '2', name: '查看账户', description: '查看账户列表和详情', key: 'view_accounts' },
        { id: '3', name: '审核账户', description: '审核和验证账户信息', key: 'verify_accounts' },
        { id: '4', name: '查看交易', description: '查看交易记录', key: 'view_transactions' },
        { id: '5', name: '查看资产', description: '查看资产记录', key: 'view_assets' },
        { id: '6', name: '管理资产', description: '创建、编辑和删除资产', key: 'manage_assets' },
        { id: '7', name: '我的申请', description: '提交和管理个人申请', key: 'manage_my_applications' },
        { id: '8', name: '审批管理', description: '审批他人提交的申请', key: 'manage_pending_approvals' },
        { id: '9', name: '归帐管理', description: '处理待归帐记录', key: 'manage_pending_accounting' },
        { id: '10', name: '执行管理', description: '执行已审批的操作', key: 'manage_pending_execution' },
        { id: '11', name: '配置管理', description: '管理系统配置项', key: 'manage_configurations' },
        { id: '12', name: '人员管理', description: '管理用户和权限', key: 'manage_personnel' },
      ];
      setPermissions(predefinedPermissions);
    } catch (error: any) {
      console.error('获取权限列表失败:', error);
      toast({
        title: "获取权限列表失败",
        description: error.message || '无法加载权限数据',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionToggle = (permission: PermissionKey) => {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
    );
  };

  async function onSubmit(values: z.infer<typeof roleFormSchema>) {
    setIsSubmitting(true);
    
    try {
      const roleData = {
        id: role ? role.id : (Date.now().toString()),
        ...values,
        permissions: selectedPermissions,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      console.log(`${role ? '更新' : '创建'}角色数据:`, roleData);
      
      if (!role) {
        // 新创建的角色保存到localStorage
        const newRoles = JSON.parse(localStorage.getItem('newRoles') || '[]');
        newRoles.push(roleData);
        localStorage.setItem('newRoles', JSON.stringify(newRoles));
        console.log('新角色已保存到localStorage:', roleData);
      }
      
      // 重置表单
      form.reset();
      setSelectedPermissions([]);
      setDialogOpen(false);
      
      toast({
        title: role ? "角色已更新" : "角色已创建",
        description: `${values.name} 角色已成功${role ? "更新" : "创建"}`,
      });
      
      // 通知父组件刷新数据
      if (onSaved) {
        onSaved();
      }
    } catch (error: any) {
      console.error('保存角色失败:', error);
      toast({
        title: "操作失败",
        description: error.message || '无法保存角色数据',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild onClick={() => setDialogOpen(true)}>
        <Button variant={role ? "ghost" : "default"} size={role ? "icon" : "default"}>
          {role ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4 mr-2" />}
          {!role && "新增角色"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{role ? "编辑角色" : "创建角色"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色名称</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色描述</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-4">
              <h4 className="font-medium">权限设置</h4>
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2">加载权限列表...</span>
                </div>
              ) : permissions.length > 0 ? (
                <PermissionList
                  permissions={permissions}
                  selectedPermissions={selectedPermissions}
                  onChange={handlePermissionToggle}
                />
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  无可用权限或加载失败，请重试
                </div>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="mr-2">处理中...</span>
                  {/* 可以添加加载图标 */}
                </>
              ) : (
                role ? "更新角色" : "创建角色"
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
