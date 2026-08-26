
import React, { useState, useEffect, useCallback, useLayoutEffect, createContext, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { menuItems } from "../../constants/menuItems";
import MenuItem from "./menu/MenuItem";
import { MenuItem as MenuItemType } from "../../types/menu";
import { useIsMobile } from "../../hooks/use-mobile";
import { ScrollArea } from "../../components/ui/scroll-area";

// 创建侧边栏上下文
interface SidebarContextType {
  isMobileOpen: boolean;
  toggleMobileSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContextType>({
  isMobileOpen: false,
  toggleMobileSidebar: () => {}
});

export const useSidebarMobile = () => useContext(SidebarContext);

const Sidebar: React.FC = () => {
  // 从localStorage加载菜单状态或使用默认值
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const saved = localStorage.getItem('expanded_menus');
    return saved ? JSON.parse(saved) : [];
  });
  
  // 添加移动端状态
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // 持久化保存菜单展开状态到localStorage
  useEffect(() => {
    localStorage.setItem('expanded_menus', JSON.stringify(expandedMenus));
  }, [expandedMenus]);
  
  // 持久化保存侧边栏折叠状态到localStorage
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // 组件挂载时识别活动路径对应的父级菜单并展开
  useEffect(() => {
    // 防止依赖数组为空的警告
    const currentPath = location.pathname;
    
    // 找到当前路径对应的父级菜单
    const activeParentMenu = menuItems.find(item => 
      item.submenu?.some(subItem => subItem.path === currentPath)
    );
    
    // 如果找到了活动的父级菜单且该菜单未展开，则将其添加到已展开菜单列表
    if (activeParentMenu && !expandedMenus.includes(activeParentMenu.title)) {
      setExpandedMenus(prev => [...prev, activeParentMenu.title]);
    }
    
    // 注意：这里不监听 location 变化，只在组件首次挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换侧边栏状态
  const toggleSidebar = () => {
    if (isMobile) {
      // 在移动端，切换侧边栏的开关状态
      setIsMobileOpen(!isMobileOpen);
    } else {
      // 在桌面端，切换侧边栏的折叠状态
      setIsCollapsed(!isCollapsed);
    }
  };

  // 切换子菜单的展开/折叠状态
  const toggleSubMenu = useCallback((title: string) => (e?: React.MouseEvent) => {
    if (e) {
      // 阻止事件传播和默认行为
      e.stopPropagation();
      e.preventDefault();
    }
    
    // 仅切换当前菜单的展开/折叠状态，不影响其他菜单
    setExpandedMenus(prev => {
      if (prev.includes(title)) {
        return prev.filter(item => item !== title);
      } else {
        return [...prev, title];
      }
    });
  }, []);

  const isActive = (path: string) => location.pathname === path;
  const isSubmenuActive = (submenu?: MenuItemType[]) => 
    Boolean(submenu?.some(item => location.pathname === item.path));

  // 创建外部可用的切换移动侧边栏方法
  const toggleMobileSidebar = () => {
    if (isMobile) {
      setIsMobileOpen(!isMobileOpen);
    }
  };

  // 提供上下文值
  const contextValue = {
    isMobileOpen,
    toggleMobileSidebar
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn(
          "fixed top-0 left-0 h-screen transition-all duration-300 flex flex-col z-50",
          "bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800",
          "border-r border-gray-200 dark:border-gray-700",
          isCollapsed && !isMobile ? "w-16" : "w-64",
          "md:relative md:translate-x-0",
          isMobile && !isMobileOpen ? "-translate-x-full" : "translate-x-0",
          isMobile && "absolute"
        )}
      >
        <div className="h-[65px] px-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
          {(!isCollapsed || isMobile) && (
            <h1 className="font-semibold text-[1.7em] bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 bg-clip-text text-transparent">财务管理系统</h1>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors md:flex"
          >
            {isMobile ? (isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />) : 
             (isCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />)}
          </button>
        </div>

        <ScrollArea className="flex-1 overflow-hidden py-2">
          <nav className="h-full">
            <ul className="space-y-1 px-2">
              {menuItems.map((item) => (
                <MenuItem
                  key={item.title}
                  item={item}
                  collapsed={isMobile ? false : isCollapsed}
                  openMenus={expandedMenus}
                  onToggleMenu={title => toggleSubMenu(title)()}
                />
              ))}
            </ul>
          </nav>
        </ScrollArea>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 backdrop-blur-sm bg-white/50 dark:bg-gray-800/50">
          <div className="flex items-center space-x-2">
            {(!isCollapsed || isMobile) && (
              <>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  A
                </div>
                <div className="flex flex-col">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">管理员</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Admin</p>
                </div>
              </>
            )}
            {isCollapsed && !isMobile && (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto">
                A
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Sidebar;
