
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
import { createRole, updateRole, getPermissionKeys } from "../../utils/roles-api";

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

  // 权限项的中文名与说明。可选项本身以后端返回为准，
  // 这里只负责展示文案，避免前后端各维护一份清单而走样。
  const PERMISSION_LABELS: Record<string, { name: string; description: string }> = {
    view_dashboard:            { name: '查看仪表盘', description: '查看财务仪表盘和统计数据' },
    view_accounts:             { name: '查看账户',   description: '查看账户列表和详情' },
    verify_accounts:           { name: '管理账户',   description: '创建、编辑和删除账户' },
    view_transactions:         { name: '查看交易',   description: '查看交易记录' },
    view_assets:               { name: '查看资产',   description: '查看资产与借贷记录' },
    manage_assets:             { name: '管理资产',   description: '创建、编辑、核销资产与借贷' },
    manage_my_applications:    { name: '我的申请',   description: '提交和管理个人申请' },
    manage_pending_approvals:  { name: '审批管理',   description: '审批他人提交的申请' },
    manage_pending_accounting: { name: '归帐管理',   description: '处理待归帐记录' },
    manage_pending_execution:  { name: '执行管理',   description: '执行已审批的操作并落账' },
    manage_configurations:     { name: '配置管理',   description: '管理科目、币种、审批规则等配置' },
    manage_personnel:          { name: '人员管理',   description: '管理用户、部门、角色与权限' },
    manage_accounting:         { name: '会计操作',   description: '账户增改、资产报损减值、借贷手工销账、汇率维护' },
  };

  const fetchPermissions = async () => {
    setIsLoading(true);
    try {
      const keys = await getPermissionKeys();
      setPermissions(keys.map((k, i) => ({
        id: String(i + 1),
        key: k,
        name: PERMISSION_LABELS[k]?.name ?? k,
        description: PERMISSION_LABELS[k]?.description ?? '',
      })));
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
      // 此前新建角色只写入 localStorage.newRoles、编辑分支什么都不做，
      // 界面却提示「角色已创建」，刷新即消失。改为真正调用接口。
      const payload = {
        name: values.name,
        description: values.description,
        permissions: selectedPermissions,
      };
      if (role) {
        await updateRole(String(role.id), payload);
      } else {
        await createRole(payload);
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
