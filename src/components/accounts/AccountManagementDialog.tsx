import React, { useEffect, useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { CustomDialogContent } from "@/components/ui/custom-dialog";
import { Button } from "@/components/ui/button";
import { Plus, UserPlus, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { getRoles } from "@/utils/api";
import { getDepartments } from "@/utils/departments-api";

// 定义账户/用户类型
interface Account {
  id: string;
  username: string;
  fullName: string;
  role: string;
  notes?: string;
  department?: string;  // 添加部门字段
}

// 组件属性
interface Props {
  account?: Account;
  onSubmit?: (values: any) => void;  // 使用any因为我们有动态schema
  isOpen?: boolean;
  onClose?: () => void;
}

// 表单值类型
type AccountFormValues = {
  username: string;
  password: string;
  fullName: string;
  role: string;
  notes: string;
  department: string;  // 添加部门字段
}

export function AccountManagementDialog({ account, onSubmit: externalOnSubmit, isOpen, onClose }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [roles, setRoles] = React.useState<any[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = React.useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = React.useState(false);
  
  // 将系统角色名称映射到内部角色标识
  const mapRoleNameToValue = (roleName: string): string => {
    const roleMap: {[key: string]: string} = {
      '管理员': 'admin',
      '财务主管': 'manager',
      '普通员工': 'staff',
      '普通用户': 'user',
      '部门主管': 'department_manager',
      '游客': 'guest'
    };
    return roleMap[roleName] || roleName.toLowerCase();
  };
  
  // 表单验证
  const isEditMode = !!account;
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(
      z.object({
        username: z.string().min(3, '用户名至少3个字符'),
        password: isEditMode
          ? z.string().optional()
          : z.string().min(6, '密码至少6个字符'),
        fullName: z.string().min(2, '姓名至少2个字符'),
        role: z.string().min(1, '请选择角色'),
        notes: z.string().optional(),
        department: z.string().optional(),
      })
    ),
    defaultValues: {
      username: "",
      password: "",
      fullName: "",
      role: "",
      notes: "",
      department: "",
    },
  });

  // 当账户变更或对话框打开时，重置表单
  useEffect(() => {
    if (account) {
      // 编辑模式下重置表单
      form.reset({
        username: account.username || "",
        password: "", // 编辑时密码始终为空
        fullName: account.fullName || "",
        role: account.role || "",
        notes: account.notes || "",
        department: account.department || "",
      });
      console.log("Loaded user data for editing:", account);
    } else {
      // 创建模式下重置表单
      form.reset({
        username: "",
        password: "",
        fullName: "",
        role: "",
        notes: "",
        department: "",
      });
    }
    
    // 强制更新角色字段，确保Select组件正确更新
    if (account && account.role) {
      setTimeout(() => {
        form.setValue('role', account.role);
      }, 100);
    }
    
    // 强制更新部门字段
    if (account && account.department) {
      setTimeout(() => {
        form.setValue('department', account.department);
      }, 100);
    }
  }, [account, form]);
  
  // 当角色列表加载完成后，设置正确的角色值
  useEffect(() => {
    // 只有当编辑模式且角色列表加载完成时才执行
    if (account && account.role && roles.length > 0 && !isLoadingRoles) {
      // 尝试找到匹配的角色
      const roleFromApi = roles.find(r => 
        mapRoleNameToValue(r.name) === account.role || 
        r.name.toLowerCase() === account.role
      );
      
      if (roleFromApi) {
        const roleValue = mapRoleNameToValue(roleFromApi.name);
        console.log(`找到匹配的角色: ${roleFromApi.name} -> ${roleValue}`);
        // 确保表单值与API角色匹配
        form.setValue('role', roleValue);
      } else {
        console.log(`未找到匹配的角色: ${account.role}，使用原始值`);
      }
    }
  }, [roles, isLoadingRoles, account, form]);

  // 当对话框打开时获取角色列表和部门列表
  useEffect(() => {
    const fetchRoles = async () => {
      setIsLoadingRoles(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/roles', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const result = await response.json();
        if (result.success && result.data) {
          setRoles(result.data);
        } else {
          console.error("Failed to load roles:", result.error?.message);
          toast({
            variant: "destructive",
            description: t('common.error') + ": " + (result.error?.message || t('common.unknownError'))
          });
        }
      } catch (error) {
        console.error("Error loading roles:", error);
      } finally {
        setIsLoadingRoles(false);
      }
    };

    const fetchDepartments = async () => {
      setIsLoadingDepartments(true);
      try {
        const token = localStorage.getItem('token');
        const projectData = localStorage.getItem('currentProject');
        const projectId = projectData ? JSON.parse(projectData).id : 1;
        const response = await fetch(`/api/departments?projectId=${projectId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const result = await response.json();
        if (result.success && result.data) {
          setDepartments(result.data);
        } else {
          console.error("加载部门列表失败:", result.error?.message);
          toast({
            variant: "destructive",
            description: t('common.error') + ": " + (result.error?.message || t('common.unknownError'))
          });
        }
      } catch (error) {
        console.error("获取部门列表错误:", error);
      } finally {
        setIsLoadingDepartments(false);
      }
    };

    // 如果对话框打开，获取角色和部门数据
    if ((isOpen !== undefined && isOpen) || (isOpen === undefined && open)) {
      fetchRoles();
      fetchDepartments();
    }
  }, [isOpen, open, t, toast]);

  // 处理外部isOpen状态
  useEffect(() => {
    if (isOpen !== undefined) {
      setOpen(isOpen);
    }
  }, [isOpen]);

  // 处理对话框关闭
  const handleClose = () => {
    setOpen(false);
    if (onClose) {
      onClose();
    }
  };

  // 表单提交处理
  function onSubmit(values: AccountFormValues) {
    toast({
      description: account 
        ? t('users.updateSuccess')
        : t('users.createSuccess')
    });
    
    // 如果提供了外部onSubmit回调，调用它
    if (externalOnSubmit) {
      // 将角色名称映射为标准值以确保一致性
      const standardizedValues = {
        ...values,
        role: values.role || "" // 确保有一个角色值
      };
      console.log("提交用户数据:", standardizedValues);
      externalOnSubmit(standardizedValues);
    } else {
      console.log(values);
    }
    
    // 提交成功后关闭对话框
    handleClose();
  }

  return (
    <Dialog open={isOpen !== undefined ? isOpen : open} onOpenChange={(value) => {
      if (!value && onClose) {
        onClose();
      }
      if (isOpen === undefined) {
        setOpen(value);
      }
    }}>
      {/* 仅在isOpen未定义时显示触发按钮 */}
      {isOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant={account ? "ghost" : "default"} size={account ? "icon" : "default"}>
            {account ? <UserPlus className="h-4 w-4" /> : <Plus className="h-4 w-4 mr-2" />}
            {!account && t('users.addUser')}
          </Button>
        </DialogTrigger>
      )}
      <CustomDialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {account ? t('users.editUser') : t('users.createUser')}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              variant="ghost" 
              size="icon"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t('common.close')}</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.username')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {account ? t('users.newPasswordOptional') : t('common.password')}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.fullName')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.role')}</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('users.selectRole')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingRoles ? (
                        <SelectItem value="loading" disabled>
                          {t('common.loading')}
                        </SelectItem>
                      ) : roles.length > 0 ? (
                        roles.map((role) => (
                          <SelectItem 
                            key={role.id} 
                            value={role.name ? mapRoleNameToValue(role.name) : `role-${role.id}`}
                          >
                            {role.name || `角色 ${role.id}`}
                          </SelectItem>
                        ))
                      ) : (
                        // 备选硬编码角色
                        <>
                          <SelectItem value="admin">{t('users.roleAdmin')}</SelectItem>
                          <SelectItem value="manager">{t('users.roleManager')}</SelectItem>
                          <SelectItem value="user">{t('users.roleUser')}</SelectItem>
                          <SelectItem value="staff">{t('users.roleStaff')}</SelectItem>
                          <SelectItem value="guest">{t('users.roleGuest')}</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* bePayId字段已从数据库中移除 */}
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>部门</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择部门" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoadingDepartments ? (
                        <SelectItem value="loading" disabled>
                          {t('common.loading') || '加载中...'}
                        </SelectItem>
                      ) : departments.length > 0 ? (
                        departments.map((department) => (
                          <SelectItem 
                            key={department.id} 
                            value={department.code || `dept-${department.id}`}
                          >
                            {department.name || `部门 ${department.id}`}
                          </SelectItem>
                        ))
                      ) : (
                        // 备选提示
                        <SelectItem value="no-departments" disabled>
                          暂无部门数据
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.notes')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">
              {account ? t('users.updateUser') : t('users.createUser')}
            </Button>
          </form>
        </Form>
      </CustomDialogContent>
    </Dialog>
  );
}