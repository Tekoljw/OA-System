
import React, { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { Plus, Edit, Trash2, User, Building2, FileQuestion, Loader2 } from "lucide-react";
import { DepartmentDialog } from "./DepartmentDialog";
import { useToast } from "../../../hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../ui/accordion";
import LoadMoreButton from "../../common/LoadMoreButton";
import { useIsMobile } from "../../../hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { apiRequest } from "../../../api/client";

interface DepartmentMember {
  id: number;
  username: string;  // 用户登录名
  fullName: string;  // 用户姓名
  role: string;      // 用户角色
  email?: string;    // 用户邮箱
}

interface Department {
  id: number;
  name: string;
  code?: string;
  manager: string;
  memberCount: number;
  members: DepartmentMember[];
}

const DepartmentList = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<{[key: string]: boolean}>({});
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // 获取当前项目ID
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
      
      // 如果没有从localStorage获取到，尝试从user对象获取
      if (!currentProjectId) {
        const userDataStr = localStorage.getItem('user');
        if (userDataStr) {
          try {
            const userData = JSON.parse(userDataStr);
            if (userData.currentProject?.id) {
              setCurrentProjectId(userData.currentProject.id);
              console.log('从user.currentProject获取到项目ID:', userData.currentProject.id);
            } else if (userData.projectId) {
              setCurrentProjectId(userData.projectId);
              console.log('从user.projectId获取到项目ID:', userData.projectId);
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

  // 在项目ID可用时加载部门数据
  useEffect(() => {
    if (currentProjectId !== null) {
      console.log('使用项目ID获取部门列表:', currentProjectId);
      fetchDepartments();
    }
  }, [currentProjectId]);

  // 从本地数据文件获取真实PostgreSQL部门数据
  const fetchDepartments = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('正在加载部门数据...');

      const result = await apiRequest('GET', '/api/departments');

      if (result.success && result.data && Array.isArray(result.data)) {
        const formattedDepartments = result.data.map((dept: any) => ({
          id: dept.id,
          name: dept.name,
          code: dept.code || '',
          // 此前写死「未指定」，主管信息完全无法呈现
          manager: dept.manager_name || dept.manager_username || '未指定',
          managerId: dept.manager_id ?? null,
          memberCount: Number(dept.member_count) || 0,
          members: []
        }));
        setDepartments(formattedDepartments);
      } else {
        throw new Error('部门数据格式错误');
      }
    } catch (error: any) {
      console.error('获取部门列表错误:', error);
      setError(error.message || '无法获取部门数据');
      toast({
        title: "加载失败",
        description: error.message || '无法获取部门数据',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 确认删除对话框状态
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState<number | null>(null);

  const handleDeleteClick = (id: number) => {
    setDepartmentToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!departmentToDelete) return;
    
    try {
      // 此前这里只从前端数组里移掉一行就报「删除成功」，压根没请求服务端 ——
      // 刷新页面部门又回来了，而且被引用的部门本该删不掉
      const res = await apiRequest('DELETE', `/api/departments/${departmentToDelete}`);
      if (!res?.success) throw new Error(res?.message || res?.error?.message || '删除失败');

      toast({
        title: "操作成功",
        description: "部门已成功删除",
      });

      setIsDeleteDialogOpen(false);
      setDepartmentToDelete(null);
      // 以服务端为准重新拉取，避免界面与库不一致
      await fetchDepartments();
    } catch (error: any) {
      console.error('删除部门错误:', error);
      toast({
        title: "删除失败",
        description: error.message || '无法删除部门',
        variant: "destructive",
      });
    }
  };

  // 加载部门成员数据
  const fetchDepartmentMembers = async (departmentId: number) => {
    // 如果已经在加载，不重复请求
    if (loadingMembers[departmentId.toString()]) {
      return;
    }
    
    // 确保有项目ID
    if (!currentProjectId) {
      console.warn('获取部门成员时未找到项目ID');
      toast({
        title: "加载失败",
        description: "无法确定当前项目",
        variant: "destructive",
      });
      return;
    }
    
    // 更新加载状态
    setLoadingMembers(prev => ({ ...prev, [departmentId.toString()]: true }));
    
    try {
      console.log(`获取项目 ${currentProjectId} 中部门 ${departmentId} 的成员列表`);
      const token = localStorage.getItem('token') || '1';
      
      // 构建带projectId的URL
      const url = `/api/departments/${departmentId}/members?projectId=${currentProjectId}`;
      console.log(`请求URL: ${url}`);
      
      // 获取部门成员列表
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`获取部门成员失败: ${errorText}`);
        throw new Error('无法获取部门成员数据');
      }
      
      // 解析响应
      const result = await response.json();
      console.log('部门成员响应结果:', result);
      
      // 服务端统一返回 { success, data }，此前这里读的是 result.users，
      // 永远取不到，成员列表始终为空
      const rawMembers = Array.isArray(result.data) ? result.data
                       : (Array.isArray(result.users) ? result.users : null);
      if (result.success && rawMembers) {
        const members: DepartmentMember[] = rawMembers.map((user: any) => ({
          id: user.id,
          username: user.username,
          fullName: user.full_name || user.fullName || '',
          role: user.role,
          email: user.email
        }));
        
        // 更新部门列表中的成员数据
        setDepartments(prev => prev.map(dept => {
          if (dept.id === departmentId) {
            return {
              ...dept,
              members,
              memberCount: members.length
            };
          }
          return dept;
        }));
      } else {
        // 如果API未返回正确格式，尝试获取用户列表并过滤
        await fetchUsersForDepartment(departmentId);
      }
    } catch (error) {
      console.error(`加载部门成员出错:`, error);
      // 尝试备用方法 - 获取所有用户并根据部门筛选
      await fetchUsersForDepartment(departmentId);
    } finally {
      // 更新加载状态
      setLoadingMembers(prev => ({ ...prev, [departmentId.toString()]: false }));
    }
  };
  
  // 备用方法：获取所有用户，并筛选出特定部门的用户
  const fetchUsersForDepartment = async (departmentId: number) => {
    try {
      // 确保有项目ID
      if (!currentProjectId) {
        console.warn('获取用户列表时未找到项目ID');
        return;
      }
      
      const token = localStorage.getItem('token') || '1';
      console.log(`尝试从项目 ${currentProjectId} 的用户列表获取部门成员`);
      
      // 构建带projectId的URL
      const url = `/api/users?projectId=${currentProjectId}`;
      console.log(`请求URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('获取用户列表失败');
      }
      
      const result = await response.json();
      
      if (result.success && Array.isArray(result.users)) {
        // 筛选出指定部门的用户
        // 由于可能没有部门字段，这里简单假设前2个用户属于id为1的部门，其他用户属于id为2的部门
        const departmentUsers = result.users.filter((user: any) => {
          // 在实际应用中，应该根据user.department字段过滤
          // 这里作为演示，简单使用奇偶ID来区分部门
          const targetDeptId = departmentId === 1 ? [1, 3, 5] : [2, 4, 6];
          return targetDeptId.includes(user.id);
        });
        
        // 转换为部门成员格式
        const members: DepartmentMember[] = departmentUsers.map((user: any) => ({
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          email: user.email
        }));
        
        // 更新部门成员
        setDepartments(prev => prev.map(dept => {
          if (dept.id === departmentId) {
            return {
              ...dept,
              members,
              memberCount: members.length
            };
          }
          return dept;
        }));
      }
    } catch (error) {
      console.error('加载用户作为部门成员时出错:', error);
      toast({
        title: "加载失败",
        description: "无法获取部门成员数据",
        variant: "destructive",
      });
    }
  };
  
  const handleAccordionChange = (value: string[]) => {
    console.log('部门展开状态变更:', value);
    setExpandedDepartments(value);
    
    // 对于新展开的部门，加载成员数据
    value.forEach(deptId => {
      if (!expandedDepartments.includes(deptId)) {
        const departmentId = parseInt(deptId);
        if (!isNaN(departmentId)) {
          fetchDepartmentMembers(departmentId);
        }
      }
    });
  };
  
  const handleMobileAccordionChange = (departmentId: number, value: string) => {
    if (value === "members") {
      fetchDepartmentMembers(departmentId);
    }
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoadingMore(false);
    // Add more departments here in a real application
  };

  // 无数据时显示的组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <FileQuestion className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无部门数据
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          添加部门以管理公司组织结构和人员
        </p>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-start mb-4">
        <DepartmentDialog onSaved={fetchDepartments} />
      </div>

      {isLoading ? (
        <Card className="p-6">
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="animate-spin">
              <Loader2 className="h-8 w-8 text-primary" />
            </div>
            <div className="text-lg font-medium">正在加载部门数据...</div>
          </div>
        </Card>
      ) : departments.length === 0 ? (
        <NoDataDisplay />
      ) : (
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              // 移动端卡片布局
              <div className="grid gap-4 p-4">
                {departments.map((dept) => (
                  <Card key={dept.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                    <CardHeader className="p-4 pb-0">
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {dept.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div className="font-medium">部门主管:</div>
                        <div>{dept.manager}</div>
                        <div className="font-medium">成员数量:</div>
                        <div>{dept.memberCount} 人</div>
                      </div>
                      
                      <Accordion 
                        type="single" 
                        collapsible 
                        className="border rounded-md"
                        onValueChange={(value) => handleMobileAccordionChange(dept.id, value)}
                      >
                        <AccordionItem value="members">
                          <AccordionTrigger className="px-4 py-2 text-sm">
                            查看成员列表
                            {loadingMembers[dept.id.toString()] && (
                              <Loader2 className="h-3 w-3 ml-2 animate-spin" />
                            )}  
                          </AccordionTrigger>
                          <AccordionContent className="p-2">
                            <div className="space-y-2">
                              {dept.members.length === 0 ? (
                                <div className="text-center py-2 text-sm text-muted-foreground">
                                  暂无部门成员
                                </div>
                              ) : (
                                dept.members.map((member) => (
                                  <div key={member.id} className="flex justify-between items-center p-2 border-b last:border-0">
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4" />
                                      <span>{member.fullName}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">{member.role}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      
                      <div className="flex justify-end gap-2 mt-3">
                        <DepartmentDialog department={dept} onSaved={fetchDepartments} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(dept.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              // PC端表格布局
              <div className="overflow-x-auto">
                <Accordion 
                  type="multiple" 
                  className="w-full"
                  value={expandedDepartments}
                  onValueChange={handleAccordionChange}
                >
                  {departments.map((dept) => (
                    <AccordionItem key={dept.id} value={dept.id.toString()} className="border-b last:border-0">
                      <AccordionTrigger className="hover:no-underline px-4 py-3">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="grid grid-cols-4 w-full">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              <span className="font-medium">{dept.name}</span>
                              {loadingMembers[dept.id.toString()] && (
                                <Loader2 className="h-3 w-3 ml-2 animate-spin" />
                              )}
                            </div>
                            <span>{dept.manager}</span>
                            <span>{dept.memberCount} 人</span>
                            <div className="flex gap-2 justify-end">
                              <DepartmentDialog department={dept} onSaved={fetchDepartments} />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(dept.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="p-4 pt-0 space-y-2">
                          <Card className="shadow-none border">
                            <CardContent className="p-0">
                              {dept.members.length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground">
                                  暂无部门成员
                                </div>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>姓名</TableHead>
                                      <TableHead>职位</TableHead>
                                      <TableHead>用户名</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {dept.members.map((member) => (
                                      <TableRow key={member.id} className="hover:bg-muted/50">
                                        <TableCell className="flex items-center gap-2">
                                          <User className="h-4 w-4" />
                                          {member.fullName}
                                        </TableCell>
                                        <TableCell>{member.role}</TableCell>
                                        <TableCell>{member.username}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isMobile && departments.length > 0 && (
        <div className="flex justify-center mt-4">
          <LoadMoreButton
            onClick={handleLoadMore}
            isLoading={isLoadingMore}
          />
        </div>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除部门</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除该部门，并且无法恢复。
              确定要继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DepartmentList;
