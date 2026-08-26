
import React from "react";
import { Bell, ChevronDown, LogOut, Lock, Loader, Menu } from "lucide-react";
import { cn } from "../../lib/utils";
import { SidebarTrigger } from "./NewSidebar";
import { useIsMobile } from "../../hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const isMobile = useIsMobile();
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const { toast } = useToast();

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    // TODO: Implement password change logic here
    toast({
      title: "Success",
      description: "Password changed successfully",
    });
    setIsPasswordDialogOpen(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <header className="bg-card border-b border-border fixed top-0 right-0 left-0 z-40 h-[65px]">
      <div className="flex items-center justify-between h-full px-4 md:px-6 w-full mx-auto">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="h-7 w-7" />
          <h1 className="hidden md:block text-lg font-semibold">{title || "财务管理系统"}</h1>
          {subtitle && (
            <p className="hidden md:block text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center space-x-2 md:space-x-4">
          <button className="relative p-1.5 rounded-md hover:bg-secondary transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive"></span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-secondary transition-colors">
                <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center text-accent-foreground">
                  A
                </div>
                <span className="hidden md:inline-block">管理员</span>
                <ChevronDown className="h-4 w-4 hidden md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsPasswordDialogOpen(true)}>
                <Lock className="mr-2 h-4 w-4" />
                修改密码
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="新密码"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="确认新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handlePasswordChange}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default Header;
