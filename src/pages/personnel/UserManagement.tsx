import React, { useState, useEffect } from "react";
import PageLayout from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { API_BASE_URL, apiRequest } from "@/api/client";
import { MoreHorizontal, Search, UserPlus, UserCheck, UserX, Loader2, Trash2 } from "lucide-react";
import { AccountManagementDialog } from "@/components/accounts/AccountManagementDialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAllUsers, updateUser, deleteUser } from "@/utils/api";
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

// 用户数据类型
interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
  status?: string;    // 兼容旧版本字段
  active?: boolean;   // 新增字段，数据库中存储的是布尔值
  email?: string;
  phone?: string;
  department?: string; // 部门字段，可能不存在于所有用户数据中
  department_id?: number; // 部门ID字段
  project_id?: number; // 项目ID字段
  is_super_admin?: boolean; // 是否为超级管理员
  created_at?: string; // 创建时间
  updated_at?: string; // 更新时间
}

const UserManagement = () => {
  // Use translation
  const { t } = useTranslation();
  
  // Function to translate role names in the UI
  const getLocalizedRoleName = (role: string): string => {
    const roleMap: Record<string, string> = {
      'admin': t('users.roleAdmin'),
      'manager': t('users.roleManager'),
      'staff': t('users.roleStaff'),
      'user': t('users.roleUser'),
      'guest': t('users.roleGuest'),
      'department_manager': t('users.roleDepartmentManager')
    };
    return roleMap[role.toLowerCase()] || role;
  };
  
  // 检查用户是否为系统管理员（ID为1的用户通常是系统管理员）
  const isSystemAdmin = (user: User): boolean => {
    return user.id === "1" || user.username.toLowerCase() === "admin";
  };
  
  // State for user list
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  // 获取当前项目ID
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  
  // 从localStorage获取当前项目ID
  useEffect(() => {
    try {
      const projectDataStr = localStorage.getItem('currentProject');
      if (projectDataStr) {
        const projectData = JSON.parse(projectDataStr);
        if (projectData && projectData.id) {
          setCurrentProjectId(projectData.id);
          console.log('从localStorage获取到当前项目ID:', projectData.id);
        }
      }
    } catch (e) {
      console.error('解析当前项目数据失败:', e);
    }
  }, []);

  // 获取用户列表
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const result = await apiRequest('GET', `/api/users?projectId=${currentProjectId || ''}`);
        const data = result.data || [];
        const formattedUsers = data.map((user: any) => ({
          id: String(user.id),
          username: user.username,
          fullName: user.full_name || user.fullName || '',
          role: user.role,
          email: user.email || '',
          phone: user.phone || '',
          notes: user.notes || '',
          status: user.is_active ? 'active' : 'inactive',
          active: user.is_active,
          department: user.department || '',
          created_at: user.created_at,
          updated_at: user.updated_at
        }));
        setUsers(formattedUsers);
        setError(null);
      } catch (error: any) {
        console.error('加载用户数据出错:', error);
        setError("数据加载失败");
        toast({
          title: "错误",
          description: error.message || '获取用户列表失败',
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    // 只有在currentProjectId有值或已尝试获取后才开始加载用户列表
    if (currentProjectId !== null) {
      console.log('使用项目ID获取用户列表:', currentProjectId);
      fetchUsers();
    }
  }, [toast, t, currentProjectId]); // 添加currentProjectId到依赖数组

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setIsCreateDialogOpen(true);
  };

  const handleEditUser = (user: any) => {
    // 检查是否为系统管理员
    if (isSystemAdmin(user) && user.role === 'admin') {
      toast({
        title: t('common.protectedAccount'),
        description: t('users.systemAdminEditRestricted'),
        variant: "destructive",
      });
      return;
    }
    
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  const handleActivateUser = async (userId: string) => {
    try {
      // 调用API来激活用户
      const result = await updateUser(userId, {
        active: true
      });
      
      if (result.success) {
        // 更新本地状态 - 同时更新status和active
        setUsers(
          users.map((user) =>
            user.id === userId ? { ...user, status: "active", active: true } : user
          )
        );
        
        toast({
          title: t('users.activateUser'),
          description: t('common.successOperation'),
        });
      } else {
        toast({
          variant: "destructive",
          title: t('common.errorOperation'),
          description: result.message || t('users.updateFailed'),
        });
      }
    } catch (error) {
      console.error('激活用户错误:', error);
      toast({
        variant: "destructive",
        title: t('common.errorOperation'),
        description: t('users.updateFailed'),
      });
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    // 查找要停用的用户
    const userToDeactivate = users.find(user => user.id === userId);
    
    // 如果是系统管理员，不允许停用
    if (userToDeactivate && isSystemAdmin(userToDeactivate) && userToDeactivate.role === 'admin') {
      toast({
        title: t('common.protectedAccount'),
        description: t('users.systemAdminDeactivateRestricted'),
        variant: "destructive",
      });
      return;
    }
    
    try {
      // 调用API来停用用户
      const result = await updateUser(userId, {
        active: false
      });
      
      if (result.success) {
        // 更新本地状态 - 同时更新status和active
        setUsers(
          users.map((user) =>
            user.id === userId ? { ...user, status: "inactive", active: false } : user
          )
        );
        
        toast({
          title: t('users.deactivateUser'),
          description: t('common.successOperation'),
        });
      } else {
        toast({
          variant: "destructive",
          title: t('common.errorOperation'),
          description: result.message || t('users.updateFailed'),
        });
      }
    } catch (error) {
      console.error('停用用户错误:', error);
      toast({
        variant: "destructive",
        title: t('common.errorOperation'),
        description: t('users.updateFailed'),
      });
    }
  };

  // 删除用户处理函数
  const handleDeleteUser = (user: User) => {
    // 检查是否为系统管理员
    if (isSystemAdmin(user) && user.role === 'admin') {
      toast({
        title: t('common.protectedAccount'),
        description: t('users.systemAdminDeleteRestricted'),
        variant: "destructive",
      });
      return;
    }
    
    // 打开确认对话框
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  // 确认删除用户
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    try {
      const result = await deleteUser(userToDelete.id);
      
      if (result.success) {
        // 从本地状态中移除用户
        setUsers(users.filter(user => user.id !== userToDelete.id));
        
        toast({
          title: t('common.successOperation'),
          description: result.message || t('users.deleteSuccess'),
        });
      } else {
        toast({
          variant: "destructive",
          title: t('common.errorOperation'),
          description: result.message || t('users.deleteFailed'),
        });
      }
    } catch (error: any) {
      console.error('删除用户错误:', error);
      toast({
        variant: "destructive",
        title: t('common.errorOperation'),
        description: error.message || t('users.deleteFailed'),
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const onCreateUser = async (userData: any) => {
    try {
      const result = await apiRequest('POST', '/api/users', {
        username: userData.username,
        password: userData.password,
        fullName: userData.fullName,
        role: userData.role,
        email: userData.email || '',
        phone: userData.phone || '',
        department: userData.department || '',
        notes: userData.notes || '',
        status: 'active'
      });

      if (result.success && result.data) {
        const newUser = {
          id: String(result.data.id),
          username: result.data.username,
          fullName: result.data.full_name || result.data.fullName || '',
          role: result.data.role,
          email: result.data.email || '',
          phone: result.data.phone || '',
          notes: result.data.notes || '',
          status: result.data.status || 'active',
          active: result.data.active ?? true,
          department: result.data.department || '',
          created_at: result.data.created_at,
          updated_at: result.data.updated_at
        };
        setUsers([...users, newUser]);
        setIsCreateDialogOpen(false);
        toast({
          title: '用户创建成功',
          description: `用户 ${userData.username} 已创建`,
        });
      } else {
        throw new Error(result.message || '创建用户失败');
      }
    } catch (error: any) {
      console.error('创建用户错误:', error);
      toast({
        variant: "destructive",
        title: '创建失败',
        description: error.message || '无法创建用户，请重试',
      });
    }
  };

  const onUpdateUser = async (userData: any) => {
    try {
      // 防止修改系统管理员的角色
      if (isSystemAdmin(selectedUser) && selectedUser.role === 'admin' && userData.role !== 'admin') {
        toast({
          variant: "destructive",
          title: t('common.protectedAccount'),
          description: t('users.systemAdminRoleRestricted'),
        });
        return;
      }
      
      // 调用API更新用户信息
      const result = await updateUser(selectedUser.id, {
        username: userData.username,
        full_name: userData.fullName,
        role: userData.role
      });
      
      if (result.success) {
        // 更新本地状态
        setUsers(
          users.map((user) =>
            user.id === selectedUser.id
              ? {
                  ...user,
                  username: userData.username,
                  fullName: userData.fullName,
                  role: userData.role
                }
              : user
          )
        );
        setIsEditDialogOpen(false);
        toast({
          title: t('common.successOperation'),
          description: t('users.updateSuccess'),
        });
      } else {
        // 显示错误提示
        toast({
          variant: "destructive",
          title: t('common.errorOperation'),
          description: result.message || t('users.updateFailed'),
        });
      }
    } catch (error) {
      console.error('更新用户错误:', error);
      toast({
        variant: "destructive",
        title: t('common.errorOperation'),
        description: t('users.updateFailed'),
      });
    }
  };

  return (
    <PageLayout title={t('users.userList')} subtitle={t('users.userDetails')}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t('common.search') + '...'}
              className="pl-8 w-full"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
          <Button variant="default" onClick={() => setIsCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            {t('users.addUser')}
          </Button>
        </div>

        {loading ? (
          <Card className="p-6">
            <div className="flex flex-col justify-center items-center min-h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <span>{t('common.loading')}...</span>
            </div>
          </Card>
        ) : error ? (
          <Card className="p-6">
            <div className="text-center py-8">
              <div className="text-lg font-medium text-destructive">
                {error}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {t('common.checkNetworkAndTryAgain')}
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                {t('common.reload')}
              </Button>
            </div>
          </Card>
        ) : !isMobile ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.username')}</TableHead>
                    <TableHead>{t('users.fullName')}</TableHead>
                    <TableHead>{t('users.role')}</TableHead>
                    <TableHead>{t('users.department') || '部门'}</TableHead>
                    <TableHead>{t('users.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.fullName}</TableCell>
                      <TableCell>{getLocalizedRoleName(user.role)}</TableCell>
                      <TableCell>{user.department || '-'}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            // 同时兼容status字符串和active布尔值
                            user.status === "active" || user.active === true
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.status === "active" || user.active === true ? t('users.active') : t('users.inactive')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          {/* 仅对非管理员显示操作菜单 */}
                          {!isSystemAdmin(user) ? (
                            <>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">{t('common.openMenu')}</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditUser(user)}>
                                  {t('common.edit')}
                                </DropdownMenuItem>
                                {(user.status === "inactive" || user.active === false) ? (
                                  <DropdownMenuItem onClick={() => handleActivateUser(user.id)}>
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    {t('users.activateUser')}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleDeactivateUser(user.id)}>
                                    <UserX className="h-4 w-4 mr-2" />
                                    {t('users.deactivateUser')}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteUser(user)} 
                                  className="text-destructive focus:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {t('common.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              {t('users.systemProtected')}
                            </span>
                          )}
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <Card key={user.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-lg">{user.fullName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {user.username} | {getLocalizedRoleName(user.role)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('users.department') || '部门'}: {user.department || '-'}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            // 同时兼容status字符串和active布尔值
                            user.status === "active" || user.active === true
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.status === "active" || user.active === true ? t('users.active') : t('users.inactive')}
                        </span>
                      </div>
                    </div>
                    {!isSystemAdmin(user) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">{t('common.openMenu')}</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            {t('common.edit')}
                          </DropdownMenuItem>
                          {(user.status === "inactive" || user.active === false) ? (
                            <DropdownMenuItem onClick={() => handleActivateUser(user.id)}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              {t('users.activateUser')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleDeactivateUser(user.id)}>
                              <UserX className="h-4 w-4 mr-2" />
                              {t('users.deactivateUser')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDeleteUser(user)} 
                            className="text-destructive focus:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {t('users.systemProtected')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AccountManagementDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onSubmit={onCreateUser}
        />

        <AccountManagementDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          account={selectedUser}
          onSubmit={onUpdateUser}
        />

        {/* 删除确认对话框 */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('users.confirmDelete')}</AlertDialogTitle>
              <AlertDialogDescription>
                {userToDelete ? (
                  <span>
                    {t('users.deleteConfirmMessage')} <strong>{userToDelete.username}</strong> ({userToDelete.fullName})?
                    {t('users.deleteWarning')}
                  </span>
                ) : (
                  t('users.deleteConfirmGeneric')
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteUser}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageLayout>
  );
};

export default UserManagement;