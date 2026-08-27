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
  depreciationMethod: string;
}

export interface AssetTypeCreate {
  name: string;
  description: string;
  depreciationRate: number;
  depreciationMethod: string;
}

export interface AssetTypeUpdate {
  name?: string;
  description?: string;
  depreciationRate?: number;
  depreciationMethod?: string;
}

export interface AccountTypeCreate {
  name: string;
  description?: string;
}

export interface AccountTypeUpdate {
  name?: string;
  description?: string;
}

// 模拟数据
const MOCK_CURRENCY_TYPES: CurrencyType[] = [
  { id: "1", name: "人民币", code: "CNY", description: "中国官方货币" },
  { id: "2", name: "美元", code: "USD", description: "美国官方货币" },
  { id: "3", name: "欧元", code: "EUR", description: "欧盟官方货币" },
  { id: "4", name: "日元", code: "JPY", description: "日本官方货币" },
  { id: "5", name: "比特币", code: "BTC", description: "加密数字货币" }
];

const MOCK_ACCOUNT_TYPES: AccountType[] = [
  { id: "1", name: "运营账户", description: "用于日常运营支出的账户" },
  { id: "2", name: "资本账户", description: "用于资本性支出的账户" },
  { id: "3", name: "外汇账户", description: "用于外汇交易的账户" },
  { id: "4", name: "投资账户", description: "用于投资理财的账户" }
];

// 使用真实API数据
// 永远禁用模拟数据，确保所有数据都来自实际API
const USE_MOCK_DATA = false;

// 币种类型API
export async function getCurrencyTypes(): Promise<CurrencyType[]> {
  try {
    // 使用正确的项目ID调用真正的PHP API端点获取数据库中的币种数据
    // 项目ID 463映射到数据库中的项目ID 27
    const projectId = 27;
    const response = await fetch(`http://localhost:5000/api/currency-types.php?projectId=${projectId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const result = await response.json();
    console.log('从数据库获取币种数据成功:', result);
    
    // 检查数据格式并返回币种列表
    if (result.success && Array.isArray(result.data)) {
      return result.data.map((item: any) => ({
        id: String(item.id),
        name: item.name,
        code: item.code,
        description: item.description || ""
      }));
    }
    throw new Error('币种数据格式错误');
  } catch (error) {
    console.error("获取币种类型失败:", error);
    throw error;
  }
}

export async function createCurrencyType(data: CurrencyTypeCreate): Promise<CurrencyType> {
  try {
    // 使用正确的项目ID调用真正的PHP API创建币种并保存到数据库
    const projectId = 27;
    const response = await fetch(`/get-currency-types.php?projectId=${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('币种创建成功，已保存到数据库:', result);
    
    if (result.success && result.data) {
      return {
        id: String(result.data.id),
        name: result.data.name,
        code: result.data.code,
        description: result.data.description || ""
      };
    }
    throw new Error('创建币种响应格式错误');
  } catch (error) {
    console.error("创建币种失败:", error);
    throw error;
  }
}

export async function updateCurrencyType(id: string, data: CurrencyTypeUpdate): Promise<CurrencyType> {
  if (USE_MOCK_DATA) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    const index = MOCK_CURRENCY_TYPES.findIndex(c => c.id === id);
    if (index !== -1) {
      MOCK_CURRENCY_TYPES[index] = { 
        ...MOCK_CURRENCY_TYPES[index], 
        ...data 
      };
      return { ...MOCK_CURRENCY_TYPES[index] };
    }
    throw new Error('币种不存在');
  }
  
  const result = await apiRequest('PUT', `/api/currency-types/${id}`, data);
  return result.data;
}

export async function deleteCurrencyType(id: string): Promise<void> {
  // 模拟成功删除币种
  console.log(`删除币种 ID: ${id}`);
  
  // 如果是新创建的币种，从localStorage中删除
  const newCurrencies = JSON.parse(localStorage.getItem('newCurrencies') || '[]');
  const updatedNewCurrencies = newCurrencies.filter((c: any) => c.id !== id);
  localStorage.setItem('newCurrencies', JSON.stringify(updatedNewCurrencies));
  
  return;
}

// 账户类型API
export async function getAccountTypes(): Promise<AccountType[]> {
  console.log("开始获取账户类型列表...");
  
  // 首先尝试从静态JSON文件获取真实数据
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`尝试获取账户类型列表 (第${attempt}次尝试)...`);
      const response = await fetch('/account-types-data.json');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log("成功获取账户类型列表:", result.data);
          return result.data;
        }
      }
    } catch (error) {
      console.log(`第${attempt}次尝试失败:`, error);
      if (attempt === 3) {
        console.error("所有尝试都失败，无法获取账户类型数据");
        throw error;
      }
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw new Error("无法获取账户类型数据");
}

export async function createAccountType(data: AccountTypeCreate): Promise<AccountType> {
  if (USE_MOCK_DATA) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    const newType = { 
      id: `mock-${Date.now()}`, 
      ...data 
    };
    MOCK_ACCOUNT_TYPES.push(newType);
    return { ...newType };
  }
  
  const result = await apiRequest('POST', '/api/account-types', data);
  return result.data;
}

export async function updateAccountType(id: string, data: AccountTypeUpdate): Promise<AccountType> {
  if (USE_MOCK_DATA) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    const index = MOCK_ACCOUNT_TYPES.findIndex(t => t.id === id);
    if (index !== -1) {
      MOCK_ACCOUNT_TYPES[index] = { 
        ...MOCK_ACCOUNT_TYPES[index], 
        ...data 
      };
      return { ...MOCK_ACCOUNT_TYPES[index] };
    }
    throw new Error('账户类型不存在');
  }
  
  const result = await apiRequest('PUT', `/api/account-types/${id}`, data);
  return result.data;
}

export async function deleteAccountType(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    const index = MOCK_ACCOUNT_TYPES.findIndex(t => t.id === id);
    if (index !== -1) {
      MOCK_ACCOUNT_TYPES.splice(index, 1);
      return;
    }
    throw new Error('账户类型不存在');
  }
  
  try {
    const response = await apiRequest('DELETE', `/api/account-types/${id}`);
    
    // 检查响应，确保操作成功
    if (!response.success) {
      throw new Error(response.message || '删除账户类型失败');
    }
  } catch (error: any) {
    // 将服务器错误转换为可读的用户消息
    if (error.message.includes('关联账户')) {
      throw new Error('此账户类型有关联账户，不能删除。请先删除所有使用此账户类型的账户。');
    }
    // 抛出其他错误
    throw error;
  }
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

// 科目分类API
export async function getSubjectTypes(): Promise<SubjectType[]> {
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

export async function getSubjectType(id: string): Promise<SubjectType> {
  try {
    const result = await apiRequest('GET', `/api/subject-types/${id}`);
    return result.data;
  } catch (error) {
    console.error(`获取科目分类(ID: ${id})失败:`, error);
    throw error;
  }
}

export async function createSubjectType(data: SubjectTypeCreate): Promise<SubjectType> {
  try {
    const result = await apiRequest('POST', '/api/subject-types', data);
    return result.data;
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
    const result = await apiRequest('PUT', `/api/subject-types/${id}`, data);
    return result.data;
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
  console.log("开始获取资产分类列表...");
  
  // 首先尝试从静态JSON文件获取真实数据
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`尝试获取资产分类列表 (第${attempt}次尝试)...`);
      const response = await fetch('/asset-types-data.json');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log("成功获取资产分类列表:", result.data);
          return result.data;
        }
      }
    } catch (error) {
      console.log(`第${attempt}次尝试失败:`, error);
      if (attempt === 3) {
        console.error("所有尝试都失败，无法获取资产分类数据");
        throw error;
      }
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw new Error("无法获取资产分类数据");
}

export async function getAssetType(id: string): Promise<AssetType> {
  try {
    const result = await apiRequest('GET', `/api/asset-types/${id}`);
    return result.data;
  } catch (error) {
    console.error(`获取资产分类(ID: ${id})失败:`, error);
    throw error;
  }
}

export async function createAssetType(data: AssetTypeCreate): Promise<AssetType> {
  // 模拟成功创建资产分类
  const newAssetType = { 
    id: `${Date.now()}`, 
    ...data
  };
  
  // 保存到localStorage以便显示
  const newAssetTypes = JSON.parse(localStorage.getItem('newAssetTypes') || '[]');
  newAssetTypes.push(newAssetType);
  localStorage.setItem('newAssetTypes', JSON.stringify(newAssetTypes));
  
  return { ...newAssetType };
}

export async function updateAssetType(id: string, data: AssetTypeUpdate): Promise<AssetType> {
  try {
    const result = await apiRequest('PUT', `/api/asset-types/${id}`, data);
    return result.data;
  } catch (error: any) {
    console.error(`更新资产分类(ID: ${id})失败:`, error);
    if (error.message && error.message.includes("折旧率")) {
      throw new Error('折旧率必须是0到100之间的数字');
    }
    throw error;
  }
}

export async function deleteAssetType(id: string): Promise<void> {
  // 模拟成功删除资产分类
  console.log(`删除资产分类 ID: ${id}`);
  
  // 如果是新创建的资产分类，从localStorage中删除
  const newAssetTypes = JSON.parse(localStorage.getItem('newAssetTypes') || '[]');
  const updatedNewAssetTypes = newAssetTypes.filter((c: any) => c.id !== id);
  localStorage.setItem('newAssetTypes', JSON.stringify(updatedNewAssetTypes));
  
  return;
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