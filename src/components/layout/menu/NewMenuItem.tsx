import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";
import { MenuItem as MenuItemType } from "../../../types/menu";
import { useMenu } from "../../../contexts/MenuContext";

interface MenuItemProps {
  item: MenuItemType;
  collapsed: boolean;
}

const NewMenuItem: React.FC<MenuItemProps> = ({ item, collapsed }) => {
  const navigate = useNavigate();
  const { isMenuExpanded, isMenuItemActive, isSubmenuActive, toggleMenu } = useMenu();
  
  const hasSubmenu = item.submenu && item.submenu.length > 0;
  const isOpen = isMenuExpanded(item.title);
  
  // 检查子菜单中是否有当前活动的路径
  const hasActiveChild = hasSubmenu && item.submenu?.some(subItem => isSubmenuActive(subItem.path));
  const isActive = isMenuItemActive(item.path);
  
  const [currentHeight, setCurrentHeight] = useState<number>(0);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuItemsRef = useRef<HTMLDivElement>(null);
  
  // 使用 requestAnimationFrame 计算和设置子菜单高度
  useEffect(() => {
    if (submenuItemsRef.current && isOpen && !collapsed) {
      requestAnimationFrame(() => {
        if (submenuItemsRef.current) {
          const height = submenuItemsRef.current.scrollHeight;
          setCurrentHeight(height);
        }
      });
    } else {
      setCurrentHeight(0);
    }
  }, [isOpen, collapsed]);
  
  // 处理父菜单点击
  const handleParentClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (hasSubmenu) {
      toggleMenu(item.title);
    } else {
      // 如果是普通菜单项，直接导航
      navigate(item.path);
    }
  };
  
  // 处理子菜单项点击
  const handleSubItemClick = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 手动导航到新路径
    navigate(path);
  };
  
  const Icon = item.icon;
  
  return (
    <div className="menu-item">
      <div
        className={cn(
          "flex items-center px-3 py-2 cursor-pointer rounded-md text-sm transition-colors",
          "hover:bg-primary/10",
          (isActive || isOpen || hasActiveChild) && !collapsed ? "bg-primary/10" : "",
          isActive && !hasSubmenu ? "text-primary font-medium" : ""
        )}
        onClick={handleParentClick}
      >
        {Icon && (
          <Icon 
            className={cn(
              "h-4 w-4 mr-2", 
              (isActive || hasActiveChild) && "text-primary"
            )} 
          />
        )}
        
        {!collapsed && (
          <>
            <span 
              className={cn(
                "flex-1", 
                (isActive || hasActiveChild) && "text-primary font-medium"
              )}
            >
              {item.title}
            </span>
            
            {hasSubmenu && (
              isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            )}
          </>
        )}
      </div>

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
                  isSubmenuActive(subItem.path) ? "bg-primary/10 text-primary font-medium" : ""
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

export default NewMenuItem;