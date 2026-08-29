/**
 * 审批规则配置 API
 * 统一走 src/api/client 的 apiRequest，自动附带 Authorization 与 projectId
 */
import { apiRequest } from '../api/client';

export type ApproverType = 'applicant_dept_manager' | 'role';

export interface ApprovalRuleNode {
  id?: number;
  step_order: number;
  approver_type: ApproverType;
  approver_role: string | null;
  required_count: number;
}

export interface ApprovalRule {
  id: number;
  project_id: number;
  name: string;
  application_type: string | null;
  min_amount: string | number;
  max_amount: string | number | null;
  /** single=按单笔金额；daily=按该部门主管当日审批额度累计 */
  amount_scope: 'single' | 'daily';
  priority: number;
  active: boolean;
  nodes: ApprovalRuleNode[];
}

export interface ApprovalRulePayload {
  name: string;
  application_type?: string | null;
  min_amount: number;
  max_amount: number | null;
  amount_scope: 'single' | 'daily';
  priority: number;
  active: boolean;
  nodes: Omit<ApprovalRuleNode, 'id'>[];
}

export async function getApprovalRules(): Promise<ApprovalRule[]> {
  const res = await apiRequest('GET', '/api/approval-rules');
  return res?.success ? (res.data ?? []) : [];
}

export async function createApprovalRule(payload: ApprovalRulePayload) {
  const res = await apiRequest('POST', '/api/approval-rules', payload);
  if (!res?.success) throw new Error(res?.message || '创建审批规则失败');
  return res.data;
}

export async function updateApprovalRule(id: number, payload: ApprovalRulePayload) {
  const res = await apiRequest('PUT', `/api/approval-rules/${id}`, payload);
  if (!res?.success) throw new Error(res?.message || '更新审批规则失败');
  return res.data;
}

export async function deleteApprovalRule(id: number) {
  const res = await apiRequest('DELETE', `/api/approval-rules/${id}`);
  if (!res?.success) throw new Error(res?.message || '删除审批规则失败');
}

/** 把节点描述成人话，用于列表展示 */
export function describeNodes(nodes: ApprovalRuleNode[]): string {
  if (!nodes?.length) return '未配置节点';
  return nodes
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map(n =>
      n.approver_type === 'applicant_dept_manager'
        ? '部门主管'
        : `${n.approver_role === 'admin' ? '管理员' : n.approver_role} ×${n.required_count}`
    )
    .join(' → ');
}

export function formatRange(min: string | number, max: string | number | null): string {
  const f = (v: string | number) => Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 0 });
  return max === null || max === undefined || max === ''
    ? `≥ ¥${f(min)}`
    : `¥${f(min)} ~ ¥${f(max)}`;
}
