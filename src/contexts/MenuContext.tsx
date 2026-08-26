import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { menuItems } from '../constants/menuItems';

interface MenuContextType {
  expandedMenus: string[];
  toggleMenu: (title: string) => void;
  isMenuExpanded: (title: string) => boolean;
  isSubmenuActive: (path: string) => boolean;
  isMenuItemActive: (path: string) => boolean;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export const MenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  // 从本地存储中恢复展开的菜单
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const saved = localStorage.getItem('expandedMenus');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved menu state:', e);
        return [];
      }
    }
    return [];
  });

  // 切换菜单展开/折叠状态
  const toggleMenu = useCallback((title: string) => {
    setExpandedMenus(prev => {
      if (prev.includes(title)) {
        // 如果菜单已展开，则折叠它
        const newState = prev.filter(item => item !== title);
        localStorage.setItem('expandedMenus', JSON.stringify(newState));
        return newState;
      } else {
        // 如果菜单已折叠，则展开它
        const newState = [...prev, title];
        localStorage.setItem('expandedMenus', JSON.stringify(newState));
        return newState;
      }
    });
  }, []);

  // 检查菜单是否展开
  const isMenuExpanded = useCallback((title: string) => {
    return expandedMenus.includes(title);
  }, [expandedMenus]);

  // 检查子菜单是否有活动项
  const isSubmenuActive = useCallback((submenuPath: string) => {
    return location.pathname === submenuPath;
  }, [location.pathname]);

  // 检查菜单项是否活动
  const isMenuItemActive = useCallback((path: string) => {
    return location.pathname === path;
  }, [location.pathname]);

  // 组件挂载时，确保当前活动路径的父菜单被展开
  useEffect(() => {
    // 找到当前路径对应的父级菜单
    const activeParentMenu = menuItems.find(item => 
      item.submenu?.some(subItem => subItem.path === location.pathname)
    );
    
    // 如果找到了活动的父级菜单且该菜单未展开，则将其添加到已展开菜单列表
    if (activeParentMenu && !expandedMenus.includes(activeParentMenu.title)) {
      setExpandedMenus(prev => {
        const newState = [...prev, activeParentMenu.title];
        localStorage.setItem('expandedMenus', JSON.stringify(newState));
        return newState;
      });
    }
    // 只在组件挂载时运行一次，不响应路径变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contextValue = {
    expandedMenus,
    toggleMenu,
    isMenuExpanded,
    isSubmenuActive,
    isMenuItemActive,
  };

  return (
    <MenuContext.Provider value={contextValue}>
      {children}
    </MenuContext.Provider>
  );
};

export const useMenu = (): MenuContextType => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenu must be used within a MenuProvider');
  }
  return context;
};