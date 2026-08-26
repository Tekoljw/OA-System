/**
 * 登录绕过辅助工具
 * 该组件提供了一种不依赖于常规API调用的方式来实现登录
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";

// 默认项目数据 - 仅用于紧急情况
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

// 硬编码的管理员用户信息 - 仅用于紧急情况
const ADMIN_USER = {
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
  currentProject: DEFAULT_PROJECTS[0], // 默认当前项目
  token: 'emergency-login-token'
};

export const useEmergencyLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // 执行紧急登录
  const performEmergencyLogin = () => {
    try {
      // 保存到本地存储以模拟正常登录流程
      localStorage.setItem('user', JSON.stringify(ADMIN_USER));
      localStorage.setItem('token', ADMIN_USER.token);
      
      // 显示通知
      toast({
        title: "紧急登录成功",
        description: "您已使用应急登录模式登录为管理员",
      });
      
      // 重定向到首页
      navigate('/');
      
      return true;
    } catch (error) {
      toast({
        title: "紧急登录失败",
        description: "无法完成应急登录",
        variant: "destructive",
      });
      
      return false;
    }
  };
  
  // 添加到全局对象供控制台访问
  useEffect(() => {
    // @ts-ignore
    window.__performEmergencyLogin = performEmergencyLogin;
  }, []);
  
  return { performEmergencyLogin };
};

// 紧急入口组件 - 可用于在登录页面添加隐藏的紧急入口
export function EmergencyLoginTrigger() {
  const { performEmergencyLogin } = useEmergencyLogin();
  
  // 双击处理
  const handleSecretClick = () => {
    performEmergencyLogin();
  };
  
  return (
    <div 
      className="absolute top-0 right-0 w-4 h-4 opacity-0"
      onDoubleClick={handleSecretClick}
    />
  );
};

export default EmergencyLoginTrigger;