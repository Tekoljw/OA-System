import { useAuth } from "../contexts/AuthContext";
import type { PermissionKey } from "../types/permission";
import type { MenuItem } from "../types/menu";

/**
 * 当前用户的权限。
 *
 * 仅用于控制界面可见性 —— 服务端对每个写操作都会独立校验，
 * 前端隐藏与否并不影响后端是否放行。
 */
export function usePermissions() {
  const { user } = useAuth();
  const permissions: PermissionKey[] = (user as any)?.permissions ?? [];
  const isSuperAdmin = Boolean((user as any)?.isSuperAdmin ?? (user as any)?.is_super_admin);

  /**
   * 传数组表示「任一满足即可」。
   * 有的页面对两类角色都开放但理由不同——比如币种配置，
   * 配置管理员进去改账户类型，会计进去维护汇率。
   */
  const can = (permission?: PermissionKey | PermissionKey[]) => {
    if (!permission) return true;      // 未标注权限的入口对所有登录用户开放
    if (isSuperAdmin) return true;
    const required = Array.isArray(permission) ? permission : [permission];
    return required.some(k => permissions.includes(k));
  };

  /**
   * 按权限过滤菜单。
   * 父级菜单在其子项被过滤光后一并隐藏，避免留下点开是空的分组。
   */
  const filterMenu = (items: MenuItem[]): MenuItem[] =>
    items.reduce<MenuItem[]>((acc, item) => {
      if (item.submenu?.length) {
        const sub = filterMenu(item.submenu);
        if (sub.length && can(item.permission)) acc.push({ ...item, submenu: sub });
        return acc;
      }
      if (can(item.permission)) acc.push(item);
      return acc;
    }, []);

  return { permissions, isSuperAdmin, can, filterMenu };
}
