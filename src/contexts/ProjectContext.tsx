import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from '../api/client';
import { useToast } from '../hooks/use-toast'; // 导入通知组件

interface Project {
  id: number;
  name: string;
  description: string | null;
  code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by_id: number | null;
}

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  switchProject: (project: Project) => Promise<boolean>;
  isLoading: boolean;
  isSwitching: boolean;
  error: Error | null;
}

const defaultContext: ProjectContextType = {
  projects: [],
  currentProject: null,
  setCurrentProject: () => {},
  switchProject: async () => false,
  isLoading: false,
  isSwitching: false,
  error: null
};

const ProjectContext = createContext<ProjectContextType>(defaultContext);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // 加载项目列表
  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  // 从本地存储恢复当前选择的项目
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && projects.length > 0) {
      const savedProject = projects.find(p => p.id === parseInt(savedProjectId));
      if (savedProject) {
        setCurrentProject(savedProject);
      } else {
        // 如果找不到保存的项目，使用第一个项目
        setCurrentProject(projects[0]);
      }
    } else if (projects.length > 0) {
      // 默认选择第一个项目
      setCurrentProject(projects[0]);
    }
  }, [projects]);

  // 获取项目列表 - 优化版
  const fetchProjects = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 从本地存储获取用户数据，这是最可靠的项目来源
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        if (user.projectsList && Array.isArray(user.projectsList)) {
          console.log('从用户数据获取项目列表:', user.projectsList);
          
          // 将用户项目列表转换为标准格式
          const formattedProjects = user.projectsList.map(project => ({
            id: project.id,
            name: project.name,
            description: project.description || null,
            code: project.code || 'default',
            active: project.active === undefined ? true : project.active,
            created_at: project.created_at || new Date().toISOString(),
            updated_at: project.updated_at || new Date().toISOString(),
            created_by_id: project.created_by_id || null
          }));
          
          setProjects(formattedProjects);
          console.log('成功设置项目列表:', formattedProjects);
          return;
        }
      }
      
      // 如果本地存储没有用户项目数据，再尝试从API获取
      try {
        // 走统一客户端，裸 axios 不带 Authorization 头会被 401
        const data = await apiRequest('GET', '/api/projects');

        if (Array.isArray(data)) {
          setProjects(data);
        } else if (data && Array.isArray(data.data)) {
          setProjects(data.data);
        } else {
          throw new Error('API返回的项目数据格式不正确');
        }
      } catch (apiError) {
        console.warn('API获取项目失败，使用默认项目:', apiError);
        
        // 使用默认测试项目
        const defaultProjects = [
          {
            id: 1,
            name: '演示项目',
            description: '系统演示项目',
            code: 'default',
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by_id: null
          }
        ];
        
        setProjects(defaultProjects);
        
        // 同时更新用户数据，确保项目列表可用
        try {
          const userData = localStorage.getItem('user');
          if (userData) {
            const user = JSON.parse(userData);
            user.projectsList = defaultProjects;
            localStorage.setItem('user', JSON.stringify(user));
            console.log('已更新用户数据中的项目列表');
          }
        } catch (e) {
          console.error('更新用户数据失败:', e);
        }
      }
    } catch (err) {
      console.error('获取项目列表过程出错:', err);
      setError(err instanceof Error ? err : new Error('未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  // 切换到新项目（本地切换，不依赖后端）
  const switchProject = async (project: Project): Promise<boolean> => {
    console.log('开始切换项目:', project);
    setIsSwitching(true);
    setError(null);
    
    try {
      // 直接在前端切换项目，不调用后端API
      // 更新当前项目
      setCurrentProject(project);
      
      // 保存到本地存储
      localStorage.setItem('currentProjectId', project.id.toString());
      localStorage.setItem('currentProject', JSON.stringify(project));
      
      // 更新用户数据中的当前项目
      const userData = localStorage.getItem('user');
      if (userData) {
        try {
          const user = JSON.parse(userData);
          user.projectId = project.id;
          user.currentProject = project;
          localStorage.setItem('user', JSON.stringify(user));
          console.log('已更新用户数据中的当前项目:', project);
        } catch (e) {
          console.error('更新用户数据中的当前项目失败:', e);
        }
      }
      
      // 显示成功通知
      toast({
        title: '项目切换成功',
        description: `已切换到项目: ${project.name}`,
      });
      
      // 页面刷新，确保所有数据与新项目一致
      setTimeout(() => {
        window.location.reload();
      }, 800);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '项目切换过程中发生错误';
      console.error('项目切换失败:', errorMessage);
      toast({
        title: '项目切换失败',
        description: errorMessage,
        variant: 'destructive',
      });
      setError(err instanceof Error ? err : new Error(errorMessage));
      return false;
    } finally {
      setIsSwitching(false);
    }
  };
  
  // 保存当前选择的项目到本地存储
  const handleSetCurrentProject = (project: Project) => {
    setCurrentProject(project);
    localStorage.setItem('currentProjectId', project.id.toString());
    localStorage.setItem('currentProject', JSON.stringify(project));
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        setCurrentProject: handleSetCurrentProject,
        switchProject,
        isLoading,
        isSwitching,
        error
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => useContext(ProjectContext);