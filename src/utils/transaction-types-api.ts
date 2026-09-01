/**
 * 流水类型体系（系统固定，只读）
 *
 * 一级 transaction_types 决定两件事：
 *   second_level —— 二级选项从哪个池子里取
 *   derives      —— 归账执行后要不要衍生资产/借贷/股东记录
 * 前端不做业务判断，一切以后端返回的这两个字段为准。
 */
import { apiRequest } from '../api/client';

export type SecondLevel = 'subject' | 'loan_type' | 'loan' | 'asset_type' | 'asset' | 'shareholder';
export type Derives = 'none' | 'loan_new' | 'loan_settle' | 'asset_new' | 'asset_dispose' | 'shareholder';

export interface TransactionTypeDef {
  code: string;
  name: string;
  direction: 'income' | 'expense';
  second_level: SecondLevel;
  derives: Derives;
  /** loan_type / loan 类型限定只能选该方向：lend=我们借出 borrow=我们借入 */
  loan_direction: 'lend' | 'borrow' | null;
  sort_order: number;
}

export interface LoanTypeDef {
  code: string;
  name: string;
  direction: 'lend' | 'borrow';
  description?: string;
}

export async function getTransactionTypeDefs(direction?: 'income' | 'expense'): Promise<TransactionTypeDef[]> {
  const path = direction ? `/api/transaction-types/${direction}` : '/api/transaction-types';
  const r = await apiRequest('GET', path);
  return r.data || [];
}

export async function getLoanTypeDefs(direction?: 'lend' | 'borrow'): Promise<LoanTypeDef[]> {
  const path = direction ? `/api/loan-types?direction=${direction}` : '/api/loan-types';
  const r = await apiRequest('GET', path);
  return r.data || [];
}

/** 某个一级类型下的二级科目池 */
export async function getSubjectsOfType(transactionTypeCode: string): Promise<Array<{ id: string; name: string }>> {
  const r = await apiRequest('GET', `/api/subjects?transactionTypeCode=${encodeURIComponent(transactionTypeCode)}`);
  return (r.data || []).map((s: any) => ({ id: String(s.id), name: s.name }));
}

/** 未结清的借贷记录，供还款流水选择销账目标 */
export async function getOpenLoans(direction: 'lend' | 'borrow'): Promise<Array<{
  id: string; label: string; remainingAmount: number; currency: string;
}>> {
  const r = await apiRequest('GET', '/api/loans');
  const list = r.data?.loans || r.data || [];
  return list
    .filter((l: any) => Number(l.remainingAmount ?? l.remaining_amount) > 0)
    .filter((l: any) => (direction === 'lend' ? l.direction === '借出' : l.direction === '借入'))
    .map((l: any) => ({
      id: String(l.id),
      label: `#${l.id} ${l.type}${l.borrower ? ` · ${l.borrower}` : ''} 未结 ${Number(l.remainingAmount ?? l.remaining_amount).toFixed(2)}`,
      remainingAmount: Number(l.remainingAmount ?? l.remaining_amount),
      currency: l.currency || 'CNY',
    }));
}

/** 尚有账面价值的资产，供出售流水选择冲减目标 */
export async function getOpenAssets(): Promise<Array<{
  id: string; label: string; remainingValue: number;
}>> {
  const r = await apiRequest('GET', '/api/assets');
  const list = r.data?.assets || r.data || [];
  return list
    .filter((a: any) => Number(a.remaining_value ?? a.remainingValue) > 0)
    .map((a: any) => ({
      id: String(a.id),
      label: `#${a.id} ${a.name} 账面 ${Number(a.remaining_value ?? a.remainingValue).toFixed(2)}`,
      remainingValue: Number(a.remaining_value ?? a.remainingValue),
    }));
}
