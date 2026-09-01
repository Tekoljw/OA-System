
export type Permission = {
  id: string;
  name: string;
  description: string;
  key: PermissionKey;
};

export type PermissionKey =
  | "view_dashboard"
  | "view_accounts"
  | "verify_accounts"
  | "view_transactions"
  | "view_assets"
  | "manage_assets"
  | "manage_my_applications"
  | "manage_pending_approvals"
  | "manage_pending_accounting"
  | "manage_pending_execution"
  | "manage_configurations"
  | "manage_personnel";

export type Role = {
  id: string;
  /** 与 users.role 对应的标识；内置角色为 admin / user */
  code?: string;
  name: string;
  description: string;
  /** 系统内置角色不可删除 */
  isSystem?: boolean;
  /** 该角色下的用户数 */
  userCount?: number;
  permissions: PermissionKey[];
};
