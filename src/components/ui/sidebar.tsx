import React, { createContext, useContext, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/utils";

type SidebarContext = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContext | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [openMobile, setOpenMobile] = useState(false);
  const isMobile = useIsMobile();
  const state = open ? "expanded" : "collapsed";

  const toggleSidebar = () => {
    setOpen(!open);
    if (!isMobile) {
      localStorage.setItem("sidebarState", !open ? "expanded" : "collapsed");
    }
  };

  useEffect(() => {
    const savedState = localStorage.getItem("sidebarState");
    if (savedState) {
      setOpen(savedState === "expanded");
    }
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        state,
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className={cn("p-1 rounded-md hover:bg-secondary transition-colors", className)}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}