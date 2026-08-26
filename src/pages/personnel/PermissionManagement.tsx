
import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, ShieldCheck, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PermissionManagementDialog } from "@/components/permissions/PermissionManagementDialog";
import { Role } from "@/types/permission";
import PageLayout from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function PermissionManagement() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);

  // 从真实PostgreSQL数据库获取角色数据
  const fetchRoles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('正在加载真实PostgreSQL角色数据...');
      
      const response = await fetch('/roles-data.json');
      const data = await response.json();
      
      if (data.success && data.roles && Array.isArray(data.roles)) {
        console.log('成功加载角色列表:', data.roles);
        
        // 转换角色数据为组件所需格式
        const processedRoles = data.roles.map(role => ({
          ...role,
          id: String(role.id),
          permissions: role.permissions || []
        }));
        
        // 检查是否有新创建的角色在localStorage中
        const newRoles = JSON.parse(localStorage.getItem('newRoles') || '[]');
        if (newRoles.length > 0) {
          // 合并新角色到现有列表
          const allRoles = [...processedRoles, ...newRoles];
          setRoles(allRoles);
          console.log('合并新创建的角色:', allRoles);
        } else {
          setRoles(processedRoles);
        }
      } else {
        throw new Error('角色数据格式错误');
        console.error('角色数据格式错误:', data);
      }
    } catch (error) {
      console.error('获取角色列表失败:', error);
      setError(error instanceof Error ? error.message : '无法获取角色数据');
      toast({
        title: "获取数据失败",
        description: error instanceof Error ? error.message : '无法获取角色数据',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 初始化加载数据
  useEffect(() => {
    fetchRoles();
  }, []);

  // 打开删除确认对话框
  const handleDeleteClick = (id: string) => {
    setRoleToDelete(id);
    setDeleteDialogOpen(true);
  };

  // 执行删除操作
  const handleDelete = async () => {
    if (!roleToDelete) return;
    
    setIsDeleting(roleToDelete);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('未授权，请先登录');
      }

      const response = await fetch(`/api/roles/${roleToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('删除角色失败');
      }

      // 从本地状态中移除角色
      setRoles(roles.filter(role => role.id !== roleToDelete));
      toast({
        title: "删除成功",
        description: "角色已成功删除",
      });
      
      // 关闭确认对话框
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('删除角色失败:', error);
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : '无法删除角色',
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
      setRoleToDelete(null);
    }
  };

  // 角色图标
  const getRoleIcon = (name: string) => {
    if (name.includes("管理员")) {
      return <ShieldCheck className="h-4 w-4 text-red-500" />;
    } else if (name.includes("经理")) {
      return <ShieldCheck className="h-4 w-4 text-green-500" />;
    } else {
      return <ShieldCheck className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <React.Fragment>
      <PageLayout title="权限管理" subtitle="管理系统角色和权限">
        <div className="flex justify-between mb-4">
          <div>
            <PermissionManagementDialog onSaved={fetchRoles} />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchRoles}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中...
              </>
            ) : (
              <>刷新</>
            )}
          </Button>
        </div>

        {isLoading ? (
          <LoadingState text={t("permissions.loading")} />
        ) : error ? (
          <ErrorState error={error} onRetry={fetchRoles} />
        ) : roles.length === 0 ? (
          <EmptyState 
            icon={<Users className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />}
            title={t("permissions.noRoles")} 
            description={t("permissions.addRolesToAssignPermissions")} 
          />
        ) : (
          <>
            {isMobile ? (
              // 移动端卡片视图
              <div className="grid gap-4">
                {roles.map((role) => (
                  <Card key={role.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                    <CardHeader className="p-4 pb-0">
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        {getRoleIcon(role.name)}
                        {role.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="text-sm mb-3">
                        <p className="text-muted-foreground">{role.description}</p>
                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                            {role.permissions.length} 个权限
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex justify-end gap-2 mt-3">
                        {role.id === "1" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="text-xs"
                          >
                            系统角色 (不可修改)
                          </Button>
                        ) : (
                          <>
                            <PermissionManagementDialog role={role} onSaved={fetchRoles} />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(role.id)}
                              disabled={isDeleting === role.id}
                            >
                              {isDeleting === role.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              // PC端表格视图
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>角色名称</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>权限数量</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={role.id} className="hover:bg-muted/50 cursor-pointer">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getRoleIcon(role.name)}
                              <span>{role.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{role.description}</TableCell>
                          <TableCell>
                            <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                              {role.permissions.length} 个权限
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {role.id === "1" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled
                                  className="text-xs"
                                >
                                  系统角色
                                </Button>
                              ) : (
                                <>
                                  <PermissionManagementDialog role={role} onSaved={fetchRoles} />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteClick(role.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </PageLayout>
      
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除此角色吗？此操作无法撤销，且如果有用户正在使用该角色可能会导致删除失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting !== null}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
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
    </React.Fragment>
  );
}
