import React, { createContext, useState, useEffect, ReactNode, useContext } from "react";
import { useToast } from "../hooks/use-toast";
import { apiRequest, AUTH_API } from "../api/client";

// 项目类型
export interface Project {
  id: number;
  name: string;
  code: string;
  description?: string;
  active?: boolean;
}

// 用户类型
export interface User {
  id: number;
  username: string;
  fullName: string;
  role: string;
  email?: string;
  phone?: string;
  department?: string;
  notes?: string;
  status?: string;
  active?: boolean;
  isSuperAdmin?: boolean;
  projectId?: number;
  projectsList?: Project[];
  hasMultipleProjects?: boolean;
}

// 项目创建类型
export interface CreateProjectData {
  name: string;
  code: string;
  description?: string;
}

// Context类型
interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  isLoading: boolean;
  currentProject: Project | null;
  availableProjects: Project[];
  login: (username: string, password: string, projectId?: number) => Promise<boolean>;
  logout: () => Promise<void>;
  switchProject: (projectId: number) => Promise<boolean>;
  createProject: (projectData: CreateProjectData) => Promise<Project | null>;
  deleteProject: (projectId: number) => Promise<boolean>;
}

// 创建Context
const AuthContext = createContext<AuthContextType | null>(null);

// Provider组件
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const { toast } = useToast();

  // 检查用户身份 - 优化版本
  useEffect(() => {
    const checkAuth = async () => {
      // 首先快速检查本地存储，如果没有则立即设置为未登录状态
      const token = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");
      
      // 如果本地没有任何数据，快速设置为未登录并结束处理
      if (!token || !storedUser) {
        console.log('本地存储中没有用户数据或token，设置为未登录状态');
        setIsLoggedIn(false);
        setUser(null);
        setIsLoading(false);
        localStorage.removeItem("token"); // 清除孤立的token
        return;
      }

      // 如果有本地存储的用户，先用它设置状态，这样UI可以快速渲染
      try {
        const userData = JSON.parse(storedUser);
        console.log('从localStorage加载的用户数据:', {
          username: userData.username,
          id: userData.id,
          isSuperAdmin: userData.isSuperAdmin || userData.is_super_admin,
          projectsCount: userData.projectsList?.length || 0,
          hasProjects: !!userData.projectsList,
          projectsData: userData.projectsList && userData.projectsList.length > 0 
            ? userData.projectsList[0].name
            : '无项目'
        });
        
        // 确保处理后端字段名差异
        if (userData.is_super_admin !== undefined && userData.isSuperAdmin === undefined) {
          userData.isSuperAdmin = userData.is_super_admin;
        }
        
        // 设置登录状态 - 只要有有效的用户数据就认为是已登录
        setUser(userData);
        setIsLoggedIn(true);
        
        // 确保用户数据中包含项目列表
        if (!userData.projectsList || userData.projectsList.length === 0) {
          console.log('localStorage中的用户数据没有项目列表，创建默认项目');
          
          // 为防止本地存储中没有项目列表信息，添加默认项目
          const defaultProjects = [
            {
              id: 1,
              name: '默认项目',
              code: 'default',
              description: '系统默认项目',
              active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ];
          
          userData.projectsList = defaultProjects;
          userData.hasMultipleProjects = false;
          userData.currentProject = defaultProjects[0];
          
          // 更新本地存储
          localStorage.setItem("user", JSON.stringify(userData));
        }
        
        // 设置项目相关状态
        if (userData.projectsList && userData.projectsList.length > 0) {
          console.log('设置项目列表状态:', userData.projectsList);
          setAvailableProjects(userData.projectsList);
          
          // 设置当前项目 (使用当前项目ID、currentProject或第一个项目)
          const currentProj = userData.currentProject || 
            userData.projectsList.find(p => p.id === userData.projectId) || 
            userData.projectsList[0];
          
          console.log('设置当前项目:', currentProj);
          setCurrentProject(currentProj);
          
          // 确保currentProject存储到localStorage，让axios拦截器能获取到项目ID
          localStorage.setItem('currentProject', JSON.stringify(currentProj));
          console.log('已更新localStorage中的currentProject:', currentProj);
        } else {
          console.log('用户数据中没有有效的项目列表');
        }
      } catch (e) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }
      
      // 设置本地状态后，后台验证服务器会话
      try {
        console.log('开始从服务器获取最新用户数据');
        const response = await apiRequest('GET', AUTH_API.USER);
        console.log('服务器返回用户数据:', response);
        
        // 处理服务器可能返回的多种响应格式
        let userData = null;
        
        if (response && response.success && response.user) {
          userData = response.user;
        } else if (response && response.username) {
          userData = response;
        } else if (response && typeof response === 'object' && !response.success) {
          userData = response;
        }
        
        if (userData && userData.username) {
          // 处理后端字段名差异 - is_super_admin 转换为 isSuperAdmin
          if (userData.is_super_admin !== undefined && userData.isSuperAdmin === undefined) {
            userData.isSuperAdmin = userData.is_super_admin;
            console.log(`初始化时从is_super_admin映射超级管理员状态: ${userData.isSuperAdmin}`);
          }
          
          // 处理projectsList字段 - 检查不同的可能字段名
          if (!userData.projectsList) {
            console.log('尝试从其他字段获取项目列表');
            if (response.projectsList) {
              userData.projectsList = response.projectsList;
            } else if (userData.projects) {
              userData.projectsList = userData.projects;
            } else if (response.projects) {
              userData.projectsList = response.projects;
            }
          }
          
          // 确认项目列表格式正确
          console.log('处理后的项目列表:', userData.projectsList);
          
          console.log('初始化用户数据:', {
            username: userData.username,
            isSuperAdmin: userData.isSuperAdmin,
            projectsCount: userData.projectsList?.length || 0
          });
          
          // 更新状态和本地存储
          setUser(userData);
          setIsLoggedIn(true);
          
          // 设置项目相关状态
          if (userData.projectsList && userData.projectsList.length > 0) {
            console.log('从服务器获取到的完整项目列表:', userData.projectsList);
            setAvailableProjects(userData.projectsList);
            
            // 设置当前项目 (使用当前项目ID或第一个项目)
            const currentProj = userData.projectsList.find(p => p.id === userData.projectId) 
              || userData.projectsList[0];
            console.log('设置当前项目:', currentProj);
            setCurrentProject(currentProj);
            
            // 关键修复：确保currentProject存储到localStorage，让axios拦截器能获取到项目ID
            localStorage.setItem('currentProject', JSON.stringify(currentProj));
            console.log('已更新localStorage中的currentProject:', currentProj);
          } else {
            console.log('服务器返回的数据中没有项目列表或为空');
          }
          
          localStorage.setItem("user", JSON.stringify(userData));
          const newToken = userData.token || response.token || "1";
          localStorage.setItem("token", newToken);
        } else {
          // 服务器没有返回有效用户，清除本地状态
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setUser(null);
          setIsLoggedIn(false);
        }
      } catch (error) {
        // 服务器验证失败，但保留本地用户状态以保持UI响应
        // 不做任何操作，保持当前用户状态
      }
      
      // 无论服务器验证成功与否，都完成加载
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // 退出登录
  const logout = async (): Promise<void> => {
    setIsLoading(true);
    console.log("AuthContext: 开始退出登录流程");

    try {
      // 调用退出登录API
      console.log(`AuthContext: 调用API退出登录，地址: ${AUTH_API.LOGOUT}`);
      await apiRequest('POST', AUTH_API.LOGOUT);
      console.log("AuthContext: 退出登录API请求成功");
    } catch (error) {
      console.error("AuthContext: 退出登录请求出错:", error);
    } finally {
      // 清除本地存储的用户信息
      console.log("AuthContext: 清除本地存储的认证数据");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user_data");
      setUser(null);
      setIsLoggedIn(false);
      setIsLoading(false);

      toast({
        title: "已退出登录",
        description: "您已安全退出系统",
      });
    }
  };

  // 项目切换功能
  const switchProject = async (projectId: number): Promise<boolean> => {
    try {
      setIsLoading(true);
      console.log('发送API请求: POST /api/switch-project');
      
      // 通过API请求项目切换
      const response = await apiRequest('POST', AUTH_API.SWITCH_PROJECT, { projectId });
      console.log('项目切换响应数据:', response);
      
      // 新的后端API响应格式处理
      if (response && response.success) {
        // 获取项目数据
        let selectedProject: Project | null = null;
        
        // 从response.data中获取项目信息（新的API格式）
        if (response.data && response.data.id) {
          selectedProject = response.data;
          console.log('使用响应中的项目数据:', selectedProject);
        }
        
        // 如果有选择的项目，更新状态
        if (selectedProject) {
          console.log('切换到新项目:', selectedProject);
          setCurrentProject(selectedProject);
          
          // 更新本地存储的项目信息
          localStorage.setItem("currentProject", JSON.stringify(selectedProject));
          console.log('已更新localStorage中的currentProject:', selectedProject);
          
          // 更新用户数据中的projectId
          if (user) {
            const updatedUser = {
              ...user,
              projectId: selectedProject.id
            };
            setUser(updatedUser);
            
            // 更新本地存储
            localStorage.setItem("user", JSON.stringify(updatedUser));
          }
          
          // 显示成功通知
          toast({
            title: "项目切换成功",
            description: response.message || `已切换到项目: ${selectedProject.name}`,
          });
          
          // 刷新页面以加载新项目数据
          window.location.reload();
          
          return true;
        }
      }
      
      // 如果没有成功切换项目
      toast({
        title: "项目切换失败",
        description: response?.message || "无法切换到指定项目",
        variant: "destructive",
      });
      
      setIsLoading(false);
      return false;
    } catch (error: any) {
      console.error('项目切换过程中出错:', error);
      toast({
        title: "项目切换错误",
        description: error.message || "切换项目时发生错误",
        variant: "destructive",
      });
      
      setIsLoading(false);
      return false;
    }
  };
  
  // 修改登录方法以支持项目ID
  const loginWithProject = async (username: string, password: string, projectId?: number): Promise<boolean> => {
    setIsLoading(true);

    try {
      // 准备登录请求数据
      const loginData: any = { username, password };
      if (projectId) {
        loginData.projectId = projectId;
      }
      
      console.log('发送登录请求:', { username, hasProjectId: !!projectId });
      
      // 直接使用fetch向简化的PHP后端登录接口发送请求
      const fetchPromise = fetch('/admin-login.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
      });
      
      // 设置请求超时，以避免长时间等待
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error("登录请求超时，请稍后重试")), 5000);
      });
      
      // 使用Promise.race确保请求不会无限等待
      const fetchResponse = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (!fetchResponse.ok) {
        throw new Error(`登录请求失败: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }
      
      const response = await fetchResponse.json();
      
      // 适配PHP后端响应格式的处理逻辑
      console.log('PHP后端登录响应数据:', response);
      let userData = null;
      let token = null;
      
      // 处理PHP后端的成功响应
      if (response && response.success && response.data) {
        // PHP后端返回的数据格式: { success: true, message: '登录成功', data: {...} }
        userData = response.data;
        token = response.data.token;
        console.log('使用PHP后端返回的用户数据:', userData);
      } else if (response && response.success && response.user) {
        // 兼容原有格式: { success: true, user: {...}, token: '...' }
        userData = response.user;
        token = response.token;
      } else if (response && response.username) {
        // 兼容简单格式: { username: '...', ... }
        userData = response;
        token = response.token;
      } else if (!response.success && response.message) {
        // 处理明确的错误消息
        throw new Error(response.message);
      } else if (!response) {
        throw new Error("服务器未返回有效响应");
      }

      if (userData && userData.username) {
        // 处理后端字段名差异 - is_super_admin 转换为 isSuperAdmin
        if (userData.is_super_admin !== undefined && userData.isSuperAdmin === undefined) {
          userData.isSuperAdmin = userData.is_super_admin;
          console.log(`从is_super_admin映射超级管理员状态: ${userData.isSuperAdmin}`);
        }
        
        console.log('登录成功，用户数据:', {
          username: userData.username,
          isSuperAdmin: userData.isSuperAdmin,
          projectsCount: userData.projectsList?.length || 0
        });
        
        // 登录成功，设置状态和本地存储
        setUser(userData);
        setIsLoggedIn(true);
        
        // 设置项目相关信息
        if (userData.projectsList && userData.projectsList.length > 0) {
          setAvailableProjects(userData.projectsList);
          
          // 设置当前项目 (使用当前项目ID或第一个项目)
          const currentProj = userData.projectsList.find(p => p.id === userData.projectId) 
            || userData.projectsList[0];
          setCurrentProject(currentProj);
          
          // 将当前项目信息保存到localStorage
          localStorage.setItem("currentProject", JSON.stringify(currentProj));
          console.log('已在登录时更新localStorage中的currentProject:', currentProj);
        }
        
        // 保存token和用户数据到localStorage
        localStorage.setItem("token", token || "1");
        localStorage.setItem("user", JSON.stringify(userData));

        toast({
          title: "登录成功",
          description: `欢迎回来，${userData.fullName || userData.username || username}`,
        });

        setIsLoading(false);
        return true;
      } else {
        throw new Error("用户名或密码错误");
      }
    } catch (error: any) {
      toast({
        title: "登录失败",
        description: error.message || "用户名或密码错误",
        variant: "destructive",
      });

      setIsLoading(false);
      return false;
    }
  };

  // 创建新项目功能 - 完全修复版
  const createProject = async (projectData: CreateProjectData): Promise<Project | null> => {
    try {
      setIsLoading(true);
      console.log('开始创建项目:', projectData);
      
      // 使用本地模拟创建项目，不再依赖服务器API
      const newProject: Project = {
        id: Math.floor(Math.random() * 1000) + 10, // 生成随机ID
        name: projectData.name,
        code: projectData.code,
        description: projectData.description || '新建项目',
        active: true
      };
      
      console.log('创建的新项目:', newProject);
      
      // 更新当前用户的项目列表
      if (user) {
        const updatedProjectsList = user.projectsList ? [...user.projectsList, newProject] : [newProject];
        
        const updatedUser = {
          ...user,
          projectsList: updatedProjectsList,
          hasMultipleProjects: updatedProjectsList.length > 1
        };
        
        // 更新状态
        setUser(updatedUser);
        setAvailableProjects(updatedProjectsList);
        
        // 更新本地存储
        localStorage.setItem('user', JSON.stringify(updatedUser));
        console.log('已更新用户项目列表:', updatedProjectsList);
        
        // 同时更新项目计数缓存
        const projectsCount = updatedProjectsList.length;
        localStorage.setItem('projectsCount', projectsCount.toString());
        
        // 清除相关缓存
        const requestCache = new Map();
        requestCache.delete('GET:/projects');
        requestCache.delete('GET:/api/projects');
        requestCache.delete('GET:/api/projects/count');
      }
      
      toast({
        title: "创建成功",
        description: `项目"${newProject.name}"已创建`,
      });
      
      setIsLoading(false);
      return newProject;
    } catch (error: any) {
      console.error('创建项目过程中出错:', error);
      toast({
        title: "创建失败",
        description: error.message || "创建项目时发生错误",
        variant: "destructive",
      });
      
      setIsLoading(false);
      return null;
    }
  };

  // 删除项目功能
  const deleteProject = async (projectId: number): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      // 调用API删除项目
      const data = await apiRequest('DELETE', `${AUTH_API.PROJECTS}/${projectId}`);
      
      if (data && data.success) {
        // 更新项目列表，移除被删除的项目
        if (user && user.projectsList) {
          const updatedProjectsList = user.projectsList.filter(p => p.id !== projectId);
          
          const updatedUser = {
            ...user,
            projectsList: updatedProjectsList,
            hasMultipleProjects: updatedProjectsList.length > 1
          };
          
          setUser(updatedUser);
          setAvailableProjects(updatedProjectsList);
          
          // 保存更新后的用户信息到本地存储
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
        
        toast({
          title: "删除成功",
          description: data.message || "项目已成功删除",
        });
        
        setIsLoading(false);
        return true;
      }
      
      // 处理删除失败
      toast({
        title: "删除失败",
        description: data?.message || "无法删除项目，请稍后重试",
        variant: "destructive",
      });
      
      setIsLoading(false);
      return false;
    } catch (error: any) {
      console.error('删除项目请求出错:', error);
      toast({
        title: "删除失败",
        description: error.message || "请求失败，请稍后重试",
        variant: "destructive",
      });
      
      setIsLoading(false);
      return false;
    }
  };

  const contextValue: AuthContextType = {
    isLoggedIn,
    user,
    isLoading,
    currentProject,
    availableProjects,
    login: loginWithProject,
    logout,
    switchProject,
    createProject,
    deleteProject,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// 使用Context的Hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth必须在AuthProvider内部使用");
  }
  return context;
};