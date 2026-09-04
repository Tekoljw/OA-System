/**
 * 配置管理API工具函数
 */

import { apiRequest } from '../api/client';

// 账户接口
export interface Account {
  id?: string;
  name: string;
  accountNumber: string;
  balance?: number;
  limit: number;
  isVerified?: boolean;
  currencyType: string;
  accountType: string;
  bank?: string;
  /** 服务端的账户状态：active 可收付款，其余（closed/inactive）一律禁止动账 */
  status?: string;
}

export interface AccountCreate {
  name: string;
  accountNumber: string;
  limit: number;
  currencyType: string;
  accountType: string;
  bank?: string;
}

export interface AccountUpdate {
  name?: string;
  accountNumber?: string;
  limit?: number;
  balance?: number;
  isVerified?: boolean;
  currencyType?: string;
  accountType?: string;
  bank?: string;
}

// 币种类型接口
export interface CurrencyType {
  id: string;
  name: string;
  code: string;
  description?: string;
}

export interface CurrencyTypeCreate {
  name: string;
  code: string;
  description?: string;
}

export interface CurrencyTypeUpdate {
  name?: string;
  description?: string;
}

// 账户类型接口
export interface AccountType {
  id: string;
  name: string;
  /** 库中 accounts.account_type 存的是这个 code（current/fixed/...），提交时须用它而非 name */
  code?: string;
  description?: string;
}

// 流水类型接口
export interface TransactionType {
  id: string;
  name: string;
  description: string;
  type: 'income' | 'expense';
}

// 科目分类接口
export interface SubjectType {
  id: string;
  name: string;
  description: string;
  category: '收入' | '支出';
}

export interface SubjectTypeCreate {
  name: string;
  description: string;
  category: '收入' | '支出';
}

export interface SubjectTypeUpdate {
  name?: string;
  description?: string;
  category?: '收入' | '支出';
}

// 资产分类接口
export interface AssetType {
  id: string;
  name: string;
  description: string;
  depreciationRate: number;
}

export interface AssetTypeCreate {
  name: string;
  description: string;
  depreciationRate: number;
}

export interface AssetTypeUpdate {
  name?: string;
  description?: string;
  depreciationRate?: number;
}

export interface AccountTypeCreate {
  name: string;
  description?: string;
}

export interface AccountTypeUpdate {
  name?: string;
  description?: string;
}

// 币种类型API
export async function getCurrencyTypes(): Promise<CurrencyType[]> {
  const result = await apiRequest('GET', '/api/currency-types');
  return (result.data || []).map((item: any) => ({
    id: String(item.id),
    name: item.name,
    code: item.code,
    description: item.description || ""
  }));
}

export async function createCurrencyType(data: CurrencyTypeCreate): Promise<CurrencyType> {
  const result = await apiRequest('POST', '/api/currency-types', data);
  return result.data;
}

export async function updateCurrencyType(id: string, data: CurrencyTypeUpdate): Promise<CurrencyType> {
  const result = await apiRequest('PUT', `/api/currency-types/${id}`, data);
  return result.data;
}

export async function deleteCurrencyType(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/currency-types/${id}`);
}

// 账户类型API
export async function getAccountTypes(): Promise<AccountType[]> {
  const result = await apiRequest('GET', '/api/account-types');
  return result.data || [];
}

export async function createAccountType(data: AccountTypeCreate): Promise<AccountType> {
  const result = await apiRequest('POST', '/api/account-types', data);
  return result.data;
}

export async function updateAccountType(id: string, data: AccountTypeUpdate): Promise<AccountType> {
  const result = await apiRequest('PUT', `/api/account-types/${id}`, data);
  return result.data;
}

export async function deleteAccountType(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/account-types/${id}`);
}

// 流水类型API
export async function getIncomeTypes(): Promise<TransactionType[]> {
  try {
    const result = await apiRequest('GET', '/api/transaction-types/income');
    return result.data || [];
  } catch (error) {
    console.error("获取收入流水类型失败:", error);
    if (error.message && error.message.includes("401")) {
      // 返回空数组，而不是抛出错误，以便优雅地处理认证失败
      return [];
    }
    throw error;
  }
}

export async function getExpenseTypes(): Promise<TransactionType[]> {
  try {
    const result = await apiRequest('GET', '/api/transaction-types/expense');
    return result.data || [];
  } catch (error) {
    console.error("获取支出流水类型失败:", error);
    if (error.message && error.message.includes("401")) {
      // 返回空数组，而不是抛出错误，以便优雅地处理认证失败
      return [];
    }
    throw error;
  }
}

export async function getAllTransactionTypes(): Promise<TransactionType[]> {
  try {
    const result = await apiRequest('GET', '/api/transaction-types');
    return result.data || [];
  } catch (error) {
    console.error("获取所有流水类型失败:", error);
    if (error.message && error.message.includes("401")) {
      // 返回空数组，而不是抛出错误，以便优雅地处理认证失败
      return [];
    }
    throw error;
  }
}

export async function getTransactionTypesByCategory(category: 'income' | 'expense'): Promise<TransactionType[]> {
  try {
    if (category === 'income') {
      return await getIncomeTypes();
    } else if (category === 'expense') {
      return await getExpenseTypes();
    }
    return [];
  } catch (error) {
    console.error(`获取${category === 'income' ? '收入' : '支出'}流水类型失败:`, error);
    return [];
  }
}

/**
 * 科目在后端以 type: 'income' | 'expense' 存储，界面以 category: '收入' | '支出' 展示。
 * 此前创建时直接把 category 发给后端，导致必然报「类型不能为空」，
 * 通过界面新增科目从来就没成功过。转换集中放在这里，两个方向都走它。
 */
const SUBJECT_CATEGORY_TO_TYPE: Record<string, 'income' | 'expense'> = {
  '收入': 'income',
  '支出': 'expense',
};

function toSubjectType(category?: string): 'income' | 'expense' | undefined {
  if (!category) return undefined;
  return SUBJECT_CATEGORY_TO_TYPE[category] ?? (category as 'income' | 'expense');
}

function fromSubjectRow(row: any): SubjectType {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description || '',
    category: row.type === 'expense' ? '支出' : '收入',
  };
}

// 科目分类API
export async function getSubjectTypes(): Promise<SubjectType[]> {
  try {
    const result = await apiRequest('GET', '/api/subject-types');
    return (result.data || []).map(fromSubjectRow);
  } catch (error) {
    console.error("获取科目分类失败:", error);
    if (error.message && error.message.includes("401")) {
      return [];
    }
    throw error;
  }
}

export async function getSubjectType(id: string): Promise<SubjectType> {
  try {
    const result = await apiRequest('GET', `/api/subject-types/${id}`);
    return fromSubjectRow(result.data);
  } catch (error) {
    console.error(`获取科目分类(ID: ${id})失败:`, error);
    throw error;
  }
}

export async function createSubjectType(data: SubjectTypeCreate): Promise<SubjectType> {
  try {
    const result = await apiRequest('POST', '/api/subject-types', {
      name: data.name,
      description: data.description,
      type: toSubjectType(data.category),
    });
    return fromSubjectRow(result.data);
  } catch (error: any) {
    console.error("创建科目分类失败:", error);
    // 处理常见错误
    if (error.message && error.message.includes("已存在")) {
      throw new Error(`科目分类 "${data.name}" 已存在`);
    }
    throw error;
  }
}

export async function updateSubjectType(id: string, data: SubjectTypeUpdate): Promise<SubjectType> {
  try {
    const result = await apiRequest('PUT', `/api/subject-types/${id}`, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.category !== undefined ? { type: toSubjectType(data.category) } : {}),
    });
    return fromSubjectRow(result.data);
  } catch (error: any) {
    console.error(`更新科目分类(ID: ${id})失败:`, error);
    throw error;
  }
}

export async function deleteSubjectType(id: string): Promise<void> {
  try {
    const response = await apiRequest('DELETE', `/api/subject-types/${id}`);
    
    // 检查响应，确保操作成功
    if (!response.success) {
      throw new Error(response.message || '删除科目分类失败');
    }
  } catch (error: any) {
    // 将服务器错误转换为可读的用户消息
    if (error.message.includes('系统默认分类')) {
      throw new Error('此科目分类为系统默认分类，不能删除');
    }
    // 抛出其他错误
    throw error;
  }
}

// 资产分类API
export async function getAssetTypes(): Promise<AssetType[]> {
  const result = await apiRequest('GET', '/api/asset-types');
  return result.data || [];
}

export async function getAssetType(id: string): Promise<AssetType> {
  const result = await apiRequest('GET', `/api/asset-types/${id}`);
  return result.data;
}

export async function createAssetType(data: AssetTypeCreate): Promise<AssetType> {
  const result = await apiRequest('POST', '/api/asset-types', data);
  return result.data;
}

export async function updateAssetType(id: string, data: AssetTypeUpdate): Promise<AssetType> {
  const result = await apiRequest('PUT', `/api/asset-types/${id}`, data);
  return result.data;
}

export async function deleteAssetType(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/asset-types/${id}`);
}

// 账户管理API
export async function getAccounts(currency?: string, type?: string): Promise<Account[]> {
  try {
    // 使用查询参数数组存储所有过滤条件
    const queryParams: string[] = [];
    
    // 添加过滤参数
    if (currency && currency !== 'ALL') queryParams.push(`currency=${encodeURIComponent(currency)}`);
    if (type && type !== 'ALL') queryParams.push(`type=${encodeURIComponent(type)}`);
    
    // 构建URL - 项目ID会由apiRequest自动添加
    let url = '/api/accounts';
    if (queryParams.length > 0) {
      url = `${url}?${queryParams.join('&')}`;
    }
    
    console.log('获取账户列表，基础URL:', url);
    const result = await apiRequest('GET', url);
    return result.data || [];
  } catch (error) {
    console.error("获取账户列表失败:", error);
    throw error;
  }
}

export async function getAccount(id: string): Promise<Account> {
  try {
    const result = await apiRequest('GET', `/api/accounts/${id}`);
    return result.data;
  } catch (error) {
    console.error(`获取账户(ID: ${id})失败:`, error);
    throw error;
  }
}

export async function createAccount(data: AccountCreate): Promise<Account> {
  try {
    const result = await apiRequest('POST', '/api/accounts', data);
    return result.data;
  } catch (error: any) {
    console.error("创建账户失败:", error);
    // 处理常见错误
    if (error.message && error.message.includes("已存在")) {
      throw new Error(`账户 "${data.name}" 已存在`);
    }
    throw error;
  }
}

export async function updateAccount(id: string, data: AccountUpdate): Promise<Account> {
  try {
    const result = await apiRequest('PUT', `/api/accounts/${id}`, data);
    return result.data;
  } catch (error: any) {
    console.error(`更新账户(ID: ${id})失败:`, error);
    throw error;
  }
}

export async function deleteAccount(id: string): Promise<void> {
  try {
    const response = await apiRequest('DELETE', `/api/accounts/${id}`);
    
    // 检查响应，确保操作成功
    if (!response.success) {
      throw new Error(response.message || '删除账户失败');
    }
  } catch (error: any) {
    // 抛出其他错误
    throw error;
  }
}