
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
  name: string;
  description: string;
  permissions: PermissionKey[];
};
