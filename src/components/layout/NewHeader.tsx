import React, { useContext } from "react";
import { Bell, ChevronDown, LogOut, Lock } from "lucide-react";
import { cn } from "../../lib/utils";
import { SidebarTrigger, useSidebar } from "./NewSidebar";
import BaseCurrencySwitcher from "./BaseCurrencySwitcher";
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
import { useIsMobile } from "../../hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import ProjectSwitcher from "../../components/ProjectSwitcher";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

const NewHeader: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const { toast } = useToast();
  const navigate = useNavigate();
  // 使用新的useAuth hook
  const { logout, user } = useAuth();
  
  // 获取侧边栏状态
  const { expanded } = useSidebar();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: t('common.failedOperation'),
        description: t('auth.passwordMismatch'),
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        title: t('common.failedOperation'),
        description: t('auth.passwordTooShort'),
        variant: "destructive",
      });
      return;
    }
    
    try {
      // 使用API修改密码
      const { changePassword } = await import('../../utils/api');
      const result = await changePassword(newPassword);
      
      if (result.success) {
        toast({
          title: t('common.successOperation'),
          description: t('auth.passwordChangeSuccess'),
        });
        setIsPasswordDialogOpen(false);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        throw new Error(result.message || t('auth.passwordChangeFailed'));
      }
    } catch (error: any) {
      console.error("密码修改错误:", error);
      toast({
        title: t('common.failedOperation'),
        description: error.message || t('auth.passwordChangeFailed'),
        variant: "destructive",
      });
    }
  };

  return (
    <header 
      className={cn(
        "bg-card border-b border-border fixed top-0 right-0 z-40 h-[65px] transition-all duration-300",
        // 根据侧边栏状态调整左侧位置
        !isMobile && expanded ? "md:left-64" : "md:left-16",
        "left-0" // 移动端不受侧边栏状态影响
      )}
    >
      <div className="flex items-center justify-between h-full px-4 md:px-6 w-full mx-auto">
        <div className="flex items-center gap-4">
          {/* 使用新的SidebarTrigger组件 */}
          <SidebarTrigger className="p-1.5" />
          <h1 className="hidden md:block text-lg font-semibold">{title || t('common.financialSystem')}</h1>
          {subtitle && (
            <p className="hidden md:block text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center space-x-2 md:space-x-4">
          {/* 项目切换器 - 仅超级管理员可见 */}
          <ProjectSwitcher />
          
          <LanguageSwitcher />

          <BaseCurrencySwitcher />
          
          <button className="relative p-1.5 rounded-md hover:bg-secondary transition-colors" title={t('common.notifications')}>
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive"></span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-secondary transition-colors">
                <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center text-accent-foreground">
                  {user?.username?.charAt(0).toUpperCase() || 'A'}
                </div>
                <span className="hidden md:inline-block">{user?.fullName || t('common.administrator')}</span>
                <ChevronDown className="h-4 w-4 hidden md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsPasswordDialogOpen(true)}>
                <Lock className="mr-2 h-4 w-4" />
                {t('auth.changePassword')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                // 直接使用AuthContext的logout函数
                logout();
                navigate('/login');
                toast({
                  title: t('auth.logoutSuccess'),
                  description: t('auth.logoutMessage'),
                });
              }}>
                <LogOut className="mr-2 h-4 w-4" />
                {t('common.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.changePassword')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder={t('auth.newPassword')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder={t('auth.confirmPassword')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handlePasswordChange}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default NewHeader;