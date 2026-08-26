/**
 * 应急登录页面
 * 提供一个简单的直接登录方式，绕过API调用，用于系统维护和紧急访问
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

// 默认项目列表
const DEFAULT_PROJECTS = [
  {
    id: 1,
    name: '默认项目',
    code: 'default',
    description: '系统默认项目',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    name: '财务部项目',
    code: 'finance',
    description: '财务部管理项目',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// 内置紧急账户列表
const EMERGENCY_ACCOUNTS = [
  {
    username: 'admin',
    password: '123123123',
    user: {
      id: 1,
      username: 'admin',
      fullName: '系统管理员',
      role: 'admin',
      department: '管理部',
      isSuperAdmin: true,
      is_super_admin: true, // 添加下划线版本确保兼容性
      active: true,
      projectsList: DEFAULT_PROJECTS,
      hasMultipleProjects: DEFAULT_PROJECTS.length > 1,
      currentProject: DEFAULT_PROJECTS[0] // 默认当前项目
    }
  },
  {
    username: 'admin',
    password: 'admin123',
    user: {
      id: 1,
      username: 'admin',
      fullName: '系统管理员',
      role: 'admin',
      department: '管理部',
      isSuperAdmin: true,
      is_super_admin: true, // 添加下划线版本确保兼容性
      active: true,
      projectsList: DEFAULT_PROJECTS,
      hasMultipleProjects: DEFAULT_PROJECTS.length > 1,
      currentProject: DEFAULT_PROJECTS[0] // 默认当前项目
    }
  }
];

const EmergencyLogin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 判断用户是否已登录
  const checkExistingLogin = () => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user && user.username) {
          return true;
        }
      }
    } catch (error) {
      console.error('检查登录状态出错:', error);
    }
    return false;
  };

  // 处理紧急登录
  const handleEmergencyLogin = () => {
    setLoading(true);
    setErrorMessage('');
    
    try {
      // 寻找匹配的紧急账户
      const account = EMERGENCY_ACCOUNTS.find(
        acc => acc.username === username && acc.password === password
      );
      
      if (account) {
        // 模拟登录成功
        setTimeout(() => {
          // 保存到本地存储
          localStorage.setItem('user', JSON.stringify(account.user));
          localStorage.setItem('token', 'emergency-token-' + Date.now());
          
          toast({
            title: "登录成功",
            description: "紧急模式登录成功",
          });
          
          // 重定向到首页
          navigate('/');
          setLoading(false);
        }, 800);
      } else {
        // 登录失败
        setTimeout(() => {
          setErrorMessage('用户名或密码错误');
          setLoading(false);
        }, 800);
      }
    } catch (error) {
      console.error('紧急登录出错:', error);
      setErrorMessage('紧急登录系统发生错误');
      setLoading(false);
    }
  };

  // 直接管理员登录
  const handleDirectAdminLogin = () => {
    setLoading(true);
    
    try {
      // 使用第一个账户直接登录
      const account = EMERGENCY_ACCOUNTS[0];
      
      setTimeout(() => {
        // 保存到本地存储
        localStorage.setItem('user', JSON.stringify(account.user));
        localStorage.setItem('token', 'emergency-direct-token-' + Date.now());
        
        toast({
          title: "直接登录成功",
          description: "已使用管理员账户登录",
        });
        
        // 重定向到首页
        navigate('/');
        setLoading(false);
      }, 800);
    } catch (error) {
      console.error('直接登录出错:', error);
      setLoading(false);
      
      toast({
        title: "登录失败",
        description: "直接登录系统发生错误",
        variant: "destructive"
      });
    }
  };

  // 清理本地存储并重置
  const handleResetStorage = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      toast({
        title: "存储已清理",
        description: "所有本地数据已被重置",
      });
      
      // 刷新页面
      window.location.reload();
    } catch (error) {
      console.error('清理存储出错:', error);
      toast({
        title: "操作失败",
        description: "无法清理存储数据",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center text-2xl font-bold text-center gap-2 justify-center">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            紧急登录系统
          </CardTitle>
          <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200 text-sm text-yellow-800">
            此页面提供紧急访问模式，绕过常规认证流程。
            {checkExistingLogin() && (
              <p className="font-bold mt-1">您当前已登录系统，无需再次登录。</p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {errorMessage && (
            <div className="bg-red-50 p-2 rounded text-red-600 text-sm border border-red-200">
              {errorMessage}
            </div>
          )}
          
          <Button
            className="w-full"
            onClick={handleEmergencyLogin}
            disabled={loading}
          >
            {loading ? '登录中...' : '紧急登录'}
          </Button>
          
          <div className="flex flex-col gap-2 mt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDirectAdminLogin}
              disabled={loading}
            >
              一键管理员登录
            </Button>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResetStorage}
              disabled={loading}
            >
              清理本地数据
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <div className="text-center w-full text-sm text-gray-500">
            紧急联系人: 系统管理员 (admin@example.com)
          </div>
          <div className="text-center w-full text-sm">
            <Link to="/login" className="text-blue-600 hover:underline">
              返回标准登录页面
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default EmergencyLogin;