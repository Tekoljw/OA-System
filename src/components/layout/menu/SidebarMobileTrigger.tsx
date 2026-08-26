import React from "react";
import { Menu } from "lucide-react";
import { cn } from "../../../lib/utils";

interface SidebarMobileTriggerProps {
  className?: string;
  onClick: () => void;
}

const SidebarMobileTrigger: React.FC<SidebarMobileTriggerProps> = ({ 
  className, 
  onClick 
}) => {
  return (
    <button
      onClick={onClick}
      className={cn("p-1.5 rounded-md hover:bg-secondary transition-colors", className)}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
};

export default SidebarMobileTrigger;