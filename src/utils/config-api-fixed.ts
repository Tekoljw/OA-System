/**
 * 配置管理API工具函数 - 修复的版本
 * 确保所有API调用使用正确的参数顺序：apiRequest(method, url, data)
 */

import { apiRequest } from './api';

// 币种类型API
export async function getIncomeTypes() {
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

export async function getExpenseTypes() {
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

export async function getAllTransactionTypes() {
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

// 科目分类API
export async function getSubjectTypes() {
  try {
    const result = await apiRequest('GET', '/api/subject-types');
    return result.data || [];
  } catch (error) {
    console.error("获取科目分类失败:", error);
    if (error.message && error.message.includes("401")) {
      return [];
    }
    throw error;
  }
}

export async function getSubjectType(id: string) {
  try {
    const result = await apiRequest('GET', `/api/subject-types/${id}`);
    return result.data;
  } catch (error) {
    console.error(`获取科目分类(ID: ${id})失败:`, error);
    throw error;
  }
}

// 资产分类API
export async function getAssetTypes() {
  try {
    const result = await apiRequest('GET', '/api/asset-types');
    return result.data || [];
  } catch (error) {
    console.error("获取资产分类失败:", error);
    if (error.message && error.message.includes("401")) {
      return [];
    }
    throw error;
  }
}

export async function getAssetType(id: string) {
  try {
    const result = await apiRequest('GET', `/api/asset-types/${id}`);
    return result.data;
  } catch (error) {
    console.error(`获取资产分类(ID: ${id})失败:`, error);
    throw error;
  }
}

// 账户管理API
export async function getAccounts(currency?: string, type?: string) {
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

export async function getAccount(id: string) {
  try {
    const result = await apiRequest('GET', `/api/accounts/${id}`);
    return result.data;
  } catch (error) {
    console.error(`获取账户(ID: ${id})失败:`, error);
    throw error;
  }
}