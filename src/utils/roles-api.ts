/**
 * 角色与权限 API
 * 统一走 apiRequest，自动附带 Authorization 与 projectId。
 */
import { apiRequest } from '../api/client';
import type { PermissionKey } from '../types/permission';

export interface RoleItem {
  id: string;
  code: string;
  name: string;
  description: string;
  /** 系统内置角色不可删除 */
  isSystem: boolean;
  /** 该角色下的用户数，删除前用于提示 */
  userCount: number;
  permissions: PermissionKey[];
}

export interface RolePayload {
  code?: string;
  name: string;
  description?: string;
  permissions: PermissionKey[];
}

export async function getRoles(): Promise<RoleItem[]> {
  const res = await apiRequest('GET', '/api/roles');
  return res?.success ? (res.data ?? []) : [];
}

/** 系统支持的全部权限项，由后端给出，避免前后端各维护一份而走样 */
export async function getPermissionKeys(): Promise<PermissionKey[]> {
  const res = await apiRequest('GET', '/api/roles/permissions');
  return res?.success ? (res.data ?? []) : [];
}

export async function createRole(payload: RolePayload): Promise<RoleItem> {
  const res = await apiRequest('POST', '/api/roles', payload);
  if (!res?.success) throw new Error(res?.message || '创建角色失败');
  return res.data;
}

export async function updateRole(id: string, payload: RolePayload): Promise<RoleItem> {
  const res = await apiRequest('PUT', `/api/roles/${id}`, payload);
  if (!res?.success) throw new Error(res?.message || '更新角色失败');
  return res.data;
}

export async function deleteRole(id: string): Promise<void> {
  const res = await apiRequest('DELETE', `/api/roles/${id}`);
  if (!res?.success) throw new Error(res?.message || '删除角色失败');
}
