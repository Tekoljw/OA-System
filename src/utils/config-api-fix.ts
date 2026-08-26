/**
 * 配置API调用修复工具
 * 用于批量修复config-api.ts中的API调用问题
 */
import { apiRequest } from './api';

// 账户类型相关API
export async function getAccountTypes() {
  return await apiRequest('GET', '/api/account-types');
}

export async function createAccountType(data: any) {
  return await apiRequest('POST', '/api/account-types', data);
}

export async function updateAccountType(id: string, data: any) {
  return await apiRequest('PUT', `/api/account-types/${id}`, data);
}

export async function deleteAccountType(id: string) {
  return await apiRequest('DELETE', `/api/account-types/${id}`);
}

// 交易类型相关API
export async function getIncomeTypes() {
  return await apiRequest('GET', '/api/transaction-types?type=income');
}

export async function getExpenseTypes() {
  return await apiRequest('GET', '/api/transaction-types?type=expense');
}

export async function getAllTransactionTypes() {
  return await apiRequest('GET', '/api/transaction-types');
}

// 科目类型相关API
export async function getSubjectTypes() {
  return await apiRequest('GET', '/api/subject-types');
}

export async function getSubjectType(id: string) {
  return await apiRequest('GET', `/api/subject-types/${id}`);
}

export async function createSubjectType(data: any) {
  return await apiRequest('POST', '/api/subject-types', data);
}

export async function updateSubjectType(id: string, data: any) {
  return await apiRequest('PUT', `/api/subject-types/${id}`, data);
}

export async function deleteSubjectType(id: string) {
  return await apiRequest('DELETE', `/api/subject-types/${id}`);
}

// 资产类型相关API
export async function getAssetTypes() {
  return await apiRequest('GET', '/api/asset-types');
}

export async function getAssetType(id: string) {
  return await apiRequest('GET', `/api/asset-types/${id}`);
}

export async function createAssetType(data: any) {
  return await apiRequest('POST', '/api/asset-types', data);
}

export async function updateAssetType(id: string, data: any) {
  return await apiRequest('PUT', `/api/asset-types/${id}`, data);
}

export async function deleteAssetType(id: string) {
  return await apiRequest('DELETE', `/api/asset-types/${id}`);
}

// 账户相关API
export async function getAccounts(currency?: string, type?: string) {
  const queryParams: Record<string, string> = {};
  if (currency) queryParams.currency = currency;
  if (type) queryParams.type = type;
  
  if (Object.keys(queryParams).length > 0) {
    const queryString = new URLSearchParams(queryParams).toString();
    return await apiRequest('GET', `/api/accounts?${queryString}`);
  }
  
  return await apiRequest('GET', '/api/accounts');
}

export async function getAccount(id: string) {
  return await apiRequest('GET', `/api/accounts/${id}`);
}

export async function createAccount(data: any) {
  return await apiRequest('POST', '/api/accounts', data);
}

export async function updateAccount(id: string, data: any) {
  return await apiRequest('PUT', `/api/accounts/${id}`, data);
}

export async function deleteAccount(id: string) {
  return await apiRequest('DELETE', `/api/accounts/${id}`);
}