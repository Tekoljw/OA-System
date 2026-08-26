import React from "react";
import { Menu } from "lucide-react";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../hooks/use-mobile";

interface SidebarMobileTriggerProps {
  className?: string;
  onClick: () => void;
}

export const SidebarMobileTrigger: React.FC<SidebarMobileTriggerProps> = ({ 
  className,
  onClick
}) => {
  const isMobile = useIsMobile();
  
  // 仅在移动端显示触发器
  if (!isMobile) return null;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
        className
      )}
      aria-label="打开菜单"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
};