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
        // 无本地凭证，设置为未登录
        setIsLoggedIn(false);
        setUser(null);
        setIsLoading(false);
        localStorage.removeItem("token"); // 清除孤立的token
        return;
      }

      // 如果有本地存储的用户，先用它设置状态，这样UI可以快速渲染
      try {
        const userData = JSON.parse(storedUser);
        // 从本地存储恢复用户状态
        
        // 确保处理后端字段名差异
        if (userData.is_super_admin !== undefined && userData.isSuperAdmin === undefined) {
          userData.isSuperAdmin = userData.is_super_admin;
        }
        
        // 设置登录状态 - 只要有有效的用户数据就认为是已登录
        setUser(userData);
        setIsLoggedIn(true);
        
        // 设置项目相关状态
        if (userData.projectsList && userData.projectsList.length > 0) {
          setAvailableProjects(userData.projectsList);

          // 设置当前项目 (使用当前项目ID、currentProject或第一个项目)
          const currentProj = userData.currentProject ||
            userData.projectsList.find(p => p.id === userData.projectId) ||
            userData.projectsList[0];

          setCurrentProject(currentProj);

          // 确保currentProject存储到localStorage，让axios拦截器能获取到项目ID
          localStorage.setItem('currentProject', JSON.stringify(currentProj));
        } else {
          // 用户数据中没有有效的项目列表
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
        const response = await apiRequest('GET', AUTH_API.USER);
        
        // 处理服务器可能返回的多种响应格式
        let userData = null;
        
        // 后端统一响应信封为 { success, message, data }，必须优先识别 data
        if (response && response.success && response.data) {
          userData = response.data;
        } else if (response && response.success && response.user) {
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
          }

          // 处理projectsList字段 - 检查不同的可能字段名
          if (!userData.projectsList) {
            if (response.projectsList) {
              userData.projectsList = response.projectsList;
            } else if (userData.projects) {
              userData.projectsList = userData.projects;
            } else if (response.projects) {
              userData.projectsList = response.projects;
            }
          }
          
          // 确认项目列表格式正确
          
          // 更新状态和本地存储
          setUser(userData);
          setIsLoggedIn(true);
          
          // 设置项目相关状态
          if (userData.projectsList && userData.projectsList.length > 0) {
            setAvailableProjects(userData.projectsList);

            // 设置当前项目 (使用当前项目ID或第一个项目)
            const currentProj = userData.projectsList.find(p => p.id === userData.projectId)
              || userData.projectsList[0];
            setCurrentProject(currentProj);

            // 确保currentProject存储到localStorage，让axios拦截器能获取到项目ID
            localStorage.setItem('currentProject', JSON.stringify(currentProj));
          }
          
          localStorage.setItem("user", JSON.stringify(userData));
          const newToken = userData.token || response.token;
          if (newToken) {
            localStorage.setItem("token", newToken);
          }
        } else {
          // 会话真正失效时后端返回 401，已由 apiRequest 统一跳转登录页。
          // 走到这里说明是 200 响应但前端未能解析，属于前端问题，
          // 不能因此清除 token（否则一次解析不兼容就会导致全站登出）。
          console.warn('无法从 /api/user 响应中解析用户信息，保留本地登录态', response);
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
    try {
      await apiRequest('POST', AUTH_API.LOGOUT);
    } catch (error) {
      // 退出登录请求失败不影响本地清理
    } finally {
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
      // 通过API请求项目切换
      const response = await apiRequest('POST', AUTH_API.SWITCH_PROJECT, { projectId });
      
      // 新的后端API响应格式处理
      if (response && response.success) {
        // 获取项目数据
        let selectedProject: Project | null = null;
        
        // 从response.data中获取项目信息（新的API格式）
        if (response.data && response.data.id) {
          selectedProject = response.data;
          // 使用响应中的项目数据
        }
        
        // 如果有选择的项目，更新状态
        if (selectedProject) {
          setCurrentProject(selectedProject);

          // 更新本地存储的项目信息
          localStorage.setItem("currentProject", JSON.stringify(selectedProject));
          
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
      toast({
        title: "项目切换错误",
        description: error.message || "切换项目时发生错误",
        variant: "destructive",
      });
      
      setIsLoading(false);
      return false;
    }
  };
  
  // 登录方法（支持项目ID）
  const loginWithProject = async (username: string, password: string, projectId?: number): Promise<boolean> => {
    setIsLoading(true);

    try {
      const loginData: any = { username, password };
      if (projectId) {
        loginData.projectId = projectId;
      }

      const response = await apiRequest('POST', AUTH_API.LOGIN, loginData);

      // 统一API返回格式: { success: true, data: {...} }
      const userData = response?.data || response;

      if (userData && userData.username) {
        // 处理后端字段名差异
        if (userData.is_super_admin !== undefined && userData.isSuperAdmin === undefined) {
          userData.isSuperAdmin = userData.is_super_admin;
        }

        setUser(userData);
        setIsLoggedIn(true);

        // 设置项目相关信息
        if (userData.projectsList && userData.projectsList.length > 0) {
          setAvailableProjects(userData.projectsList);

          const currentProj = userData.projectsList.find((p: Project) => p.id === userData.projectId)
            || userData.projectsList[0];
          setCurrentProject(currentProj);
          localStorage.setItem("currentProject", JSON.stringify(currentProj));
        }

        if (userData.token) {
          localStorage.setItem("token", userData.token);
        }
        localStorage.setItem("user", JSON.stringify(userData));

        toast({
          title: "登录成功",
          description: `欢迎回来，${userData.fullName || userData.username}`,
        });

        setIsLoading(false);
        return true;
      } else {
        throw new Error(response?.message || "用户名或密码错误");
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

  // 创建新项目
  const createProject = async (projectData: CreateProjectData): Promise<Project | null> => {
    try {
      setIsLoading(true);

      const response = await apiRequest('POST', AUTH_API.PROJECTS, projectData);
      const newProject = response?.data;

      if (newProject && user) {
        const updatedProjectsList = user.projectsList ? [...user.projectsList, newProject] : [newProject];
        const updatedUser = {
          ...user,
          projectsList: updatedProjectsList,
          hasMultipleProjects: updatedProjectsList.length > 1
        };
        setUser(updatedUser);
        setAvailableProjects(updatedProjectsList);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      toast({
        title: "创建成功",
        description: `项目"${newProject?.name || projectData.name}"已创建`,
      });

      setIsLoading(false);
      return newProject;
    } catch (error: any) {
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