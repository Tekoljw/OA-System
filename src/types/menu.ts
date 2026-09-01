import type { PermissionKey } from "./permission";

export interface MenuItem {
  title: string;
  path: string;
  icon: React.ElementType;
  /**
   * 显示该菜单项所需的权限。未标注表示所有登录用户可见。
   * 仅控制可见性，服务端仍独立校验 —— 前端看得到不等于后端放行。
   */
  permission?: PermissionKey | PermissionKey[];
  submenu?: MenuItem[];
}
