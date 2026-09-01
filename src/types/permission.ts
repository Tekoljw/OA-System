
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
  | "manage_personnel"
  /** 会计操作：账户增改、资产报损减值、借贷手工销账、汇率维护 */
  | "manage_accounting";

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
