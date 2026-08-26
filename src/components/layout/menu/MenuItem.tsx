import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";
import { MenuItem as MenuItemType } from "../../../types/menu";

interface MenuItemProps {
  item: MenuItemType;
  collapsed: boolean;
  openMenus: string[];
  onToggleMenu: (title: string) => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ item, collapsed, openMenus, onToggleMenu }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === item.path;
  const hasSubmenu = item.submenu && item.submenu.length > 0;
  const isOpen = openMenus.includes(item.title);
  
  // 本地状态跟踪菜单是否应该展开
  const [localOpen, setLocalOpen] = useState(isOpen);
  
  // 检查子菜单中是否有当前活动的路径
  const hasActiveChild = item.submenu?.some(subItem => location.pathname === subItem.path);
  
  const [currentHeight, setCurrentHeight] = useState<number>(0);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuItemsRef = useRef<HTMLDivElement>(null);
  
  // 同步本地状态和父组件状态
  useEffect(() => {
    setLocalOpen(isOpen);
  }, [isOpen]);
  
  // 当有活动子菜单时强制展开父菜单
  useEffect(() => {
    if (hasActiveChild && !isOpen && !collapsed) {
      // 仅通知父组件，不直接修改本地状态
      onToggleMenu(item.title);
    }
  }, [hasActiveChild, isOpen, collapsed, item.title, onToggleMenu]);
  
  // 使用 RAF (requestAnimationFrame) 更平滑地应用高度变化
  useEffect(() => {
    if (submenuItemsRef.current && (isOpen || hasActiveChild) && !collapsed) {
      // 使用 RAF 让浏览器在更新前优化渲染
      requestAnimationFrame(() => {
        if (submenuItemsRef.current) {
          const height = submenuItemsRef.current.scrollHeight;
          setCurrentHeight(height);
        }
      });
    } else if ((!isOpen && !hasActiveChild) || collapsed) {
      setCurrentHeight(0);
    }
  }, [isOpen, hasActiveChild, collapsed]);
  
  // 在菜单内容变化或窗口大小调整时更新高度
  useEffect(() => {
    if (submenuItemsRef.current && (isOpen || hasActiveChild) && !collapsed) {
      const updateHeight = () => {
        if (submenuItemsRef.current) {
          const height = submenuItemsRef.current.scrollHeight;
          setCurrentHeight(height);
        }
      };
      
      updateHeight();
      
      // 添加窗口大小变化监听器
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }
  }, [item.submenu, isOpen, hasActiveChild, collapsed]);

  // 处理子菜单项点击 - 不再依赖路由变化
  const handleSubItemClick = useCallback((path: string, e: React.MouseEvent) => {
    // 停止事件传播，防止触发父组件的事件
    e.stopPropagation();
    e.preventDefault();
    
    // 手动导航到新路径
    navigate(path);
  }, [navigate]);
  
  // 处理父菜单点击
  const handleClick = (e: React.MouseEvent) => {
    if (hasSubmenu) {
      e.preventDefault();
      e.stopPropagation();
      onToggleMenu(item.title);
    }
  };

  const Icon = item.icon;

  return (
    <div className="menu-item">
      {hasSubmenu ? (
        <div
          className={cn(
            "flex items-center px-3 py-2 cursor-pointer rounded-md text-sm transition-colors",
            "hover:bg-primary/10",
            (isOpen || hasActiveChild) && !collapsed ? "bg-primary/10" : ""
          )}
          onClick={handleClick}
        >
          {Icon && <Icon className={cn("h-4 w-4 mr-2", hasActiveChild && "text-primary")} />}
          {!collapsed && (
            <>
              <span className={cn("flex-1", hasActiveChild && "text-primary font-medium")}>{item.title}</span>
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </>
          )}
        </div>
      ) : (
        <Link
          to={item.path}
          className={cn(
            "flex items-center px-3 py-2 rounded-md text-sm transition-colors",
            "hover:bg-primary/10",
            isActive ? "bg-primary/10 text-primary font-medium" : ""
          )}
          onClick={(e) => {
            // 点击常规菜单项时停止事件冒泡
            e.stopPropagation();
          }}
        >
          {Icon && <Icon className={cn("h-4 w-4 mr-2", isActive && "text-primary")} />}
          {!collapsed && <span>{item.title}</span>}
        </Link>
      )}

      {hasSubmenu && (
        <div 
          ref={submenuRef}
          className="overflow-hidden transition-all duration-300 ease-in-out pl-4"
          style={{
            height: collapsed ? 0 : currentHeight,
            opacity: collapsed ? 0 : 1,
          }}
        >
          <div 
            ref={submenuItemsRef}
            className={cn(
              "submenu border-l border-border ml-2 pl-2 mt-1 space-y-1",
              collapsed && "hidden"
            )}
          >
            {item.submenu?.map((subItem) => (
              <div
                key={subItem.path}
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-md transition-colors cursor-pointer",
                  "hover:bg-primary/10",
                  location.pathname === subItem.path ? "bg-primary/10 text-primary font-medium" : ""
                )}
                onClick={(e) => handleSubItemClick(subItem.path, e)}
              >
                {subItem.icon && <subItem.icon className="h-4 w-4 mr-2" />}
                <span>{subItem.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuItem;