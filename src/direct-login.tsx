/**
 * 直接登录实用工具 - 无需API调用
 * 提供简单的直接登录功能，绕过所有服务器请求
 */

import { useNavigate } from 'react-router-dom';
import { toast } from "@/hooks/use-toast";

/**
 * 执行直接登录，无需API调用
 * 这是一个紧急登录机制，直接在本地存储创建登录状态
 */
export default function directLogin() {
  const navigate = useNavigate();
  
  try {
    // 默认项目信息
    const defaultProjects = [
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
    
    // 硬编码管理员用户信息
    const adminUser = {
      id: 1,
      username: 'admin',
      fullName: '系统管理员',
      role: 'admin',
      department: '管理部',
      isSuperAdmin: true,
      is_super_admin: true,
      active: true,
      projectsList: defaultProjects,
      hasMultipleProjects: defaultProjects.length > 1,
      currentProject: defaultProjects[0],
      token: 'emergency-login-token'
    };
    
    // 写入本地存储，模拟成功登录
    localStorage.setItem('user', JSON.stringify(adminUser));
    localStorage.setItem('token', adminUser.token);
    
    // 显示成功通知
    toast({
      title: "紧急登录成功",
      description: "您已使用应急模式登录为管理员"
    });
    
    // 跳转到首页
    navigate('/');
    
    return true;
  } catch (error) {
    console.error('紧急登录失败:', error);
    toast({
      title: "紧急登录失败",
      description: "请尝试使用控制台命令登录",
      variant: "destructive"
    });
    
    return false;
  }
}

// 将函数添加到全局对象，便于控制台访问
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__adminLogin = function() {
    // 默认项目信息
    const defaultProjects = [
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
    
    const adminUser = {
      id: 1,
      username: 'admin',
      fullName: '系统管理员',
      role: 'admin',
      department: '管理部',
      isSuperAdmin: true,
      is_super_admin: true,
      active: true,
      projectsList: defaultProjects,
      hasMultipleProjects: defaultProjects.length > 1,
      currentProject: defaultProjects[0],
      token: 'emergency-login-token'
    };
    
    localStorage.setItem('user', JSON.stringify(adminUser));
    localStorage.setItem('token', adminUser.token);
    
    console.log('已创建本地管理员会话，包含项目列表数据');
    console.log('项目列表:', defaultProjects);
    
    // 尝试跳转
    try {
      window.location.href = '/';
    } catch (e) {
      console.error('无法自动跳转，请手动刷新页面');
    }
    
    return '紧急登录已执行，包含多项目支持';
  };
}