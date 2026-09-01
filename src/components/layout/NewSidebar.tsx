import React, { useState, useEffect, createContext, useContext } from "react";
import { useLocation, Link } from "react-router-dom";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { menuItems } from "../../constants/menuItems";
import { usePermissions } from "../../hooks/use-permissions";
import { useAuth } from "../../contexts/AuthContext";
import { useIsMobile } from "../../hooks/use-mobile";
import { MenuItem } from "../../types/menu";

// 创建侧边栏上下文
interface SidebarContext {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  activeMenus: string[];
  toggleActiveMenu: (menu: string) => void;
}

const SidebarContext = createContext<SidebarContext | null>(null);

// 提供全局访问侧边栏状态的Hook
export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
};

// 侧边栏Provider组件
export const SidebarProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // 检测是否为移动设备
  const isMobile = useIsMobile();
  
  // 侧边栏展开状态 (只在桌面端使用)
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebar_expanded');
    return saved ? JSON.parse(saved) : true;
  });
  
  // 移动端侧边栏打开状态
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // 记录打开的菜单项
  const [activeMenus, setActiveMenus] = useState<string[]>(() => {
    const saved = localStorage.getItem('sidebar_active_menus');
    return saved ? JSON.parse(saved) : [];
  });
  
  // 切换菜单展开/折叠状态
  const toggleActiveMenu = (menu: string) => {
    try {
      setActiveMenus(current => {
        // 如果菜单已经包含在活动菜单中，则移除它
        if (current.includes(menu)) {
          return current.filter(item => item !== menu);
        } 
        // 否则添加它
        else {
          return [...current, menu];
        }
      });
    } catch (error) {
      console.error("切换菜单状态出错:", error);
    }
  };
  
  // 保存状态到localStorage
  useEffect(() => {
    localStorage.setItem('sidebar_expanded', JSON.stringify(expanded));
  }, [expanded]);
  
  useEffect(() => {
    localStorage.setItem('sidebar_active_menus', JSON.stringify(activeMenus));
  }, [activeMenus]);
  
  // 当屏幕大小改变时关闭移动侧边栏
  useEffect(() => {
    if (!isMobile) {
      setMobileOpen(false);
    }
  }, [isMobile]);
  
  return (
    <SidebarContext.Provider value={{
      expanded,
      setExpanded,
      mobileOpen,
      setMobileOpen,
      activeMenus,
      toggleActiveMenu
    }}>
      {children}
    </SidebarContext.Provider>
  );
};

// 侧边栏子菜单项组件
interface SidebarSubMenuProps {
  item: MenuItem;
  level?: number;
}

const SidebarSubMenu: React.FC<SidebarSubMenuProps> = ({ item, level = 0 }) => {
  const { activeMenus, toggleActiveMenu, expanded, setMobileOpen } = useSidebar();
  const location = useLocation();
  const isActive = activeMenus.includes(item.title);
  const isCurrentPath = location.pathname === item.path;
  const hasSubmenu = item.submenu && item.submenu.length > 0;
  
  // 检查该项或子项是否包含当前路径
  const containsCurrentPath = (menuItem: MenuItem): boolean => {
    // 如果直接匹配
    if (location.pathname === menuItem.path) {
      return true;
    }
    
    // 安全检查，防止无限循环
    if (!menuItem.submenu || menuItem.submenu.length === 0) {
      return false;
    }
    
    // 检查子菜单
    for (const sub of menuItem.submenu) {
      if (location.pathname === sub.path) {
        return true;
      }
      // 只检查一级子菜单，避免太深的递归
      if (sub.submenu && sub.submenu.some(nestedItem => location.pathname === nestedItem.path)) {
        return true;
      }
    }
    
    return false;
  };
  
  // 检查菜单项是否包含当前路径
  const isActivePathItem = containsCurrentPath(item);
  
  // 计算缩进
  const indent = level * 16;
  
  return (
    <li>
      {hasSubmenu ? (
        <div className="flex flex-col">
          <button
            className={cn(
              "flex items-center justify-between w-full py-2 px-3 rounded-md text-sm",
              "transition-colors duration-200",
              "hover:bg-secondary",
              isActivePathItem && "bg-secondary/50 font-medium"
            )}
            onClick={() => toggleActiveMenu(item.title)}
            style={{ paddingLeft: expanded ? `${indent + 12}px` : '12px' }}
          >
            <div className="flex items-center gap-3">
              {item.icon && <item.icon className="h-4 w-4" />}
              {expanded && <span>{item.title}</span>}
            </div>
            {expanded && (isActive ? 
              <ChevronDown className="h-4 w-4" /> : 
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {isActive && expanded && (
            <ul className="mt-1 space-y-1">
              {item.submenu?.map(subItem => (
                <SidebarSubMenu key={subItem.title} item={subItem} level={level + 1} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Link
          to={item.path}
          className={cn(
            "flex items-center py-2 px-3 rounded-md text-sm",
            "transition-colors duration-200",
            "hover:bg-secondary",
            isCurrentPath && "bg-secondary font-medium"
          )}
          style={{ paddingLeft: expanded ? `${indent + 12}px` : '12px' }}
          onClick={() => {
            // 在移动模式下关闭侧边栏
            const isMobile = window.innerWidth < 768;
            if (isMobile && setMobileOpen) {
              setMobileOpen(false);
            }
          }}
        >
          <div className="flex items-center gap-3">
            {item.icon && <item.icon className="h-4 w-4" />}
            {expanded && <span>{item.title}</span>}
          </div>
        </Link>
      )}
    </li>
  );
};

// 侧边栏触发器按钮
export interface SidebarTriggerProps {
  className?: string;
}

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({ className }) => {
  const { expanded, setExpanded, mobileOpen, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();
  
  const handleClick = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setExpanded(!expanded);
    }
  };
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "p-2 rounded-md",
        "hover:bg-secondary transition-colors",
        className
      )}
      aria-label={isMobile ? "Toggle mobile menu" : "Toggle sidebar"}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
};

// 主侧边栏组件
const NewSidebar: React.FC = () => {
  // 按当前用户权限过滤菜单：无权限的入口不显示
  const { filterMenu } = usePermissions();
  const { user } = useAuth();
  const visibleMenuItems = filterMenu(menuItems);
  const { expanded, mobileOpen, setMobileOpen, setExpanded } = useSidebar();
  const isMobile = useIsMobile();
  
  return (
    <>
      {/* 移动端覆盖层 */}
      {isMobile && mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}
      
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50",
          "flex flex-col",
          "bg-card border-r",
          "transition-all duration-300",
          expanded ? "w-64" : "w-16",
          isMobile && "w-64",
          isMobile && (mobileOpen ? "translate-x-0" : "-translate-x-full"),
          "md:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b">
          {(expanded || isMobile) && (
            <h1 className="text-lg font-semibold truncate">财务管理系统</h1>
          )}
          <button
            onClick={() => isMobile ? setMobileOpen(false) : setExpanded(!expanded)}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
          >
            {isMobile ? <X className="h-5 w-5" /> : (expanded ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />)}
          </button>
        </div>
        
        <ScrollArea className="flex-1">
          <nav className="p-2">
            <ul className="space-y-1">
              {visibleMenuItems.map(item => (
                <SidebarSubMenu key={item.title} item={item} />
              ))}
            </ul>
          </nav>
        </ScrollArea>
        
        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3">
            {/* 此前这里硬编码「管理员 / Admin」，与实际登录身份无关 */}
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            {(expanded || isMobile) && (
              <div>
                <p className="text-sm font-medium">{user?.fullName || user?.username || '未登录'}</p>
                <p className="text-xs text-muted-foreground">{user?.username || ''}</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default NewSidebar;