import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { useToast } from "../hooks/use-toast";
import { Loader2 } from "lucide-react";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // 检查是否已登录 - 从本地存储检查
  useEffect(() => {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (user && token) {
      // 已经登录，跳转到首页
      navigate("/");
    }
  }, [navigate]);
  
  // 简化登录流程
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 表单验证
    if (!username || !password) {
      toast({
        title: "错误",
        description: "请输入用户名和密码",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('开始登录流程:', { username, password: '***' });
      
      // 构建完整的URL，确保我们请求的是正确的端口
      const baseUrl = window.location.hostname.includes('replit') 
        ? `https://${window.location.hostname}`
        : 'http://localhost:5000';
      
      console.log('尝试连接到真实数据库登录接口:', `${baseUrl}/database-login.php`);
      
      // 使用真实数据库登录接口
      const response = await fetch(`${baseUrl}/database-login.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.error('登录请求失败:', response.status, response.statusText);
        throw new Error(`登录请求失败: ${response.status} ${response.statusText}`);
      }
      
      console.log('收到登录响应');
      const data = await response.json();
      console.log('登录响应数据:', data);
      
      if (data.success) {
        // 保存用户数据和令牌到本地存储
        console.log('登录成功，保存用户数据');
        localStorage.setItem('user', JSON.stringify(data.data));
        localStorage.setItem('token', data.data.token);
        
        // 确保current project也被保存，这是前端路由保护需要的
        if (data.data.currentProject) {
          localStorage.setItem('currentProject', JSON.stringify(data.data.currentProject));
        }
        
        toast({
          title: "登录成功",
          description: "欢迎回来！",
        });
        
        // 使用一个延迟，确保本地存储已更新
        setTimeout(() => {
          navigate("/");
          window.location.reload(); // 强制刷新，确保整个应用能识别已登录状态
        }, 300);
      } else {
        console.error('登录成功但返回状态为失败:', data);
        throw new Error(data.message || "登录失败");
      }
    } catch (error: any) {
      console.error('登录失败:', error);
      toast({
        title: "登录失败",
        description: error.message || "用户名或密码错误",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // 紧急登录功能 - 简化版
  const handleEmergencyLogin = () => {
    setIsLoading(true);
    
    try {
      // 硬编码管理员用户信息
      const adminUser = {
        id: 1,
        username: 'admin',
        fullName: '系统管理员',
        role: 'admin',
        department: '管理部',
        isSuperAdmin: true,
        active: true,
        token: 'emergency-login-token'
      };
      
      // 写入本地存储，模拟成功登录
      localStorage.setItem('user', JSON.stringify(adminUser));
      localStorage.setItem('token', adminUser.token);
      
      // 显示成功通知
      toast({
        title: "紧急登录成功",
        description: "您已使用应急模式登录"
      });
      
      // 跳转到首页
      navigate('/');
    } catch (error) {
      console.error('紧急登录失败:', error);
      toast({
        title: "紧急登录失败",
        description: "请联系系统管理员",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      {/* 隐藏的紧急入口区域 */}
      <div 
        className="absolute top-0 right-0 w-12 h-12 opacity-0 cursor-pointer" 
        onClick={handleEmergencyLogin}
        title="紧急登录入口"
      />
      <div className="w-full max-w-sm mx-auto">
        {/* 正常登录页面 */}
        <Card className="shadow-lg border border-gray-100">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold text-primary">智能办公系统</CardTitle>
            <CardDescription>
              请输入您的账号和密码登录
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登录中...
                  </>
                ) : (
                  "登录"
                )}
              </Button>
              
              <div className="pt-4 space-y-2">
                <Button 
                  type="button"
                  onClick={handleEmergencyLogin}
                  className="w-full bg-amber-500 hover:bg-amber-600"
                  variant="secondary"
                >
                  紧急模式登录
                </Button>

                <div className="text-center text-sm text-gray-500">
                  测试用户名: phpuser, 密码: 123456
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;