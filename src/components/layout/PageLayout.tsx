import React, { useEffect } from "react";
import NewHeader from "./NewHeader";
import NewSidebar from "./NewSidebar";
import { useSidebar } from "./NewSidebar";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../hooks/use-mobile";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

/**
 * 通用页面布局组件
 * 提供一致的页面结构，包括侧边栏、顶部导航和内容区域
 * PC端侧边栏展开时内容区域向右推移，移动端侧边栏覆盖在内容区域上
 */
const PageLayout: React.FC<PageLayoutProps> = ({ children, title, subtitle }) => {
  const { expanded } = useSidebar();
  const isMobile = useIsMobile();
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NewSidebar />
      
      {/* 
        PC端：根据侧边栏状态调整左边距，实现内容推移效果
        移动端：保持内容区域不变，侧边栏覆盖在内容上方
      */}
      <div 
        className={cn(
          "flex-1 overflow-auto transition-all duration-300",
          !isMobile && expanded ? "md:ml-64" : "md:ml-16", // PC端内容区域随侧边栏状态变化
          "ml-0" // 移动端不受侧边栏状态影响
        )}
      >
        <NewHeader title={title} subtitle={subtitle} />
        
        <main className="pt-[75px] px-6 pb-6 w-full overflow-x-hidden">
          <div className="mx-auto max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default PageLayout;