
import React from "react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import { MenuItem } from "../../../types/menu";

interface MenuSubItemProps {
  subItem: MenuItem;
  isActive: boolean;
}

const MenuSubItem: React.FC<MenuSubItemProps> = ({ subItem, isActive }) => {
  const handleClick = (e: React.MouseEvent) => {
    // 阻止事件冒泡，防止触发父菜单的折叠
    e.stopPropagation();
    
    // 如果是当前已激活的路径，阻止导航
    if (subItem.path === window.location.pathname) {
      e.preventDefault();
    }
    
    // 将此子菜单的路径添加到localStorage中
    const currentPath = subItem.path;
    localStorage.setItem('last_path', currentPath);
  };

  return (
    <li className="relative">
      <Link
        to={subItem.path}
        onClick={handleClick}
        className={cn(
          "flex items-center px-3 py-2 rounded-md transition-all duration-200",
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-gray-600 dark:text-gray-400"
        )}
      >
        <span className="w-4 h-4 mr-2 flex items-center justify-center">
          <subItem.icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm">{subItem.title}</span>
      </Link>
    </li>
  );
};

export default MenuSubItem;
