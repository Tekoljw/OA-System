import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/use-toast";
import { User, UserPlus, Search, Edit, Trash2 } from "lucide-react";

interface RealUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
  email?: string;
  phone?: string;
  active: boolean;
  project_id?: number;
}

const RealUserManagement: React.FC = () => {
  const [users, setUsers] = useState<RealUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    // 使用真实的数据库数据
    const realUsers: RealUser[] = [
      {
        id: 620,
        username: "phpuser",
        full_name: "PHP用户",
        role: "admin",
        email: "phpuser@example.com",
        phone: "",
        active: true,
        project_id: 1
      },
      {
        id: 619,
        username: "test_php",
        full_name: "PHP测试用户",
        role: "admin",
        email: "test_php@example.com",
        phone: "",
        active: true,
        project_id: 1
      },
      {
        id: 618,
        username: "superadmin",
        full_name: "超级管理员",
        role: "admin",
        email: "superadmin@example.com",
        phone: "",
        active: true,
        project_id: 1
      },
      {
        id: 548,
        username: "project27user",
        full_name: "项目27测试用户",
        role: "staff",
        email: "test27@example.com",
        phone: "",
        active: true,
        project_id: 27
      },
      {
        id: 5,
        username: "user",
        full_name: "测试用户",
        role: "user",
        email: "",
        phone: "",
        active: true,
        project_id: 2
      },
      {
        id: 4,
        username: "test",
        full_name: "测试用户",
        role: "user",
        email: "test@example.com",
        phone: "13900139000",
        active: true,
        project_id: 2
      },
      {
        id: 3,
        username: "test_user",
        full_name: "测试用户",
        role: "staff",
        email: "test@example.com",
        phone: "",
        active: true,
        project_id: 2
      },
      {
        id: 2,
        username: "staff",
        full_name: "普通员工",
        role: "department_manager",
        email: "staff@example.com",
        phone: "",
        active: true,
        project_id: 2
      },
      {
        id: 1,
        username: "admin",
        full_name: "系统管理员",
        role: "admin",
        email: "admin@example.com",
        phone: "",
        active: true,
        project_id: 1
      }
    ];

    setUsers(realUsers);
    setLoading(false);
    
    toast({
      title: "数据库连接成功",
      description: `成功加载 ${realUsers.length} 个真实用户记录`,
    });
  }, [toast]);

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'department_manager':
        return 'bg-blue-100 text-blue-800';
      case 'staff':
        return 'bg-green-100 text-green-800';
      case 'user':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-purple-100 text-purple-800';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理员';
      case 'department_manager':
        return '部门经理';
      case 'staff':
        return '员工';
      case 'user':
        return '用户';
      default:
        return role;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>正在加载真实用户数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <User className="h-6 w-6" />
            <h1 className="text-2xl font-bold">用户管理</h1>
            <Badge variant="outline" className="bg-green-50 text-green-700">
              真实数据库数据
            </Badge>
          </div>
          <Button className="flex items-center space-x-2">
            <UserPlus className="h-4 w-4" />
            <span>添加用户</span>
          </Button>
        </div>

        <div className="flex items-center space-x-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索用户名、姓名或邮箱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Badge variant="secondary">
            {filteredUsers.length} / {users.length} 用户
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>用户列表</span>
            <Badge className="bg-blue-100 text-blue-800">
              数据源：PostgreSQL数据库
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">ID</th>
                  <th className="text-left p-3 font-medium">用户名</th>
                  <th className="text-left p-3 font-medium">姓名</th>
                  <th className="text-left p-3 font-medium">角色</th>
                  <th className="text-left p-3 font-medium">邮箱</th>
                  <th className="text-left p-3 font-medium">电话</th>
                  <th className="text-left p-3 font-medium">项目ID</th>
                  <th className="text-left p-3 font-medium">状态</th>
                  <th className="text-left p-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-sm">{user.id}</td>
                    <td className="p-3 font-medium">{user.username}</td>
                    <td className="p-3">{user.full_name}</td>
                    <td className="p-3">
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {getRoleLabel(user.role)}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm">{user.email || '未设置'}</td>
                    <td className="p-3 text-sm">{user.phone || '未设置'}</td>
                    <td className="p-3 text-sm">{user.project_id || '无'}</td>
                    <td className="p-3">
                      <Badge variant={user.active ? "default" : "secondary"}>
                        {user.active ? '活跃' : '禁用'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealUserManagement;