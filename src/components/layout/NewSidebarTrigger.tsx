import React from "react";
import { Menu } from "lucide-react";
import { cn } from "../../lib/utils";
import { useNewSidebar } from "./NewSidebar";

interface NewSidebarTriggerProps {
  className?: string;
}

const NewSidebarTrigger: React.FC<NewSidebarTriggerProps> = ({ className }) => {
  const { toggleMobileSidebar, isMobile, toggleSidebar } = useNewSidebar();
  
  const handleClick = () => {
    console.log("NewSidebarTrigger按钮被点击", { isMobile, toggleMobileSidebar });
    if (isMobile) {
      console.log("尝试切换移动端侧边栏");
      toggleMobileSidebar();
    } else {
      toggleSidebar();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn("p-1.5 rounded-md hover:bg-secondary transition-colors", className)}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
};

export default NewSidebarTrigger;