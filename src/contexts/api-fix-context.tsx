/**
 * API修复上下文和Provider
 * 
 * 这个文件提供了一个全局的上下文，用于确保所有API调用使用正确的参数顺序：
 * apiRequest(method, url, data)
 * 
 * 它还确保每个请求会自动包含当前的projectId
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { getIncomeTypes, getExpenseTypes, getAllTransactionTypes, 
         getSubjectTypes, getSubjectType, getAssetTypes, getAssetType, 
         getAccounts, getAccount } from '../utils/config-api-fixed';
import * as originalApi from '../utils/config-api';

// 创建上下文
type ApiFixContextType = {
  // 币种类型API
  getCurrencyTypes: typeof originalApi.getCurrencyTypes;
  createCurrencyType: typeof originalApi.createCurrencyType;
  updateCurrencyType: typeof originalApi.updateCurrencyType;
  deleteCurrencyType: typeof originalApi.deleteCurrencyType;
  
  // 账户类型API
  getAccountTypes: typeof originalApi.getAccountTypes;
  createAccountType: typeof originalApi.createAccountType;
  updateAccountType: typeof originalApi.updateAccountType;
  deleteAccountType: typeof originalApi.deleteAccountType;
  
  // 流水类型API
  getIncomeTypes: typeof getIncomeTypes;
  getExpenseTypes: typeof getExpenseTypes;
  getAllTransactionTypes: typeof getAllTransactionTypes;
  
  // 科目分类API
  getSubjectTypes: typeof getSubjectTypes;
  getSubjectType: typeof getSubjectType;
  createSubjectType: typeof originalApi.createSubjectType;
  updateSubjectType: typeof originalApi.updateSubjectType;
  deleteSubjectType: typeof originalApi.deleteSubjectType;
  
  // 资产分类API
  getAssetTypes: typeof getAssetTypes;
  getAssetType: typeof getAssetType;
  createAssetType: typeof originalApi.createAssetType;
  updateAssetType: typeof originalApi.updateAssetType;
  deleteAssetType: typeof originalApi.deleteAssetType;
  
  // 账户管理API
  getAccounts: typeof getAccounts;
  getAccount: typeof getAccount;
  createAccount: typeof originalApi.createAccount;
  updateAccount: typeof originalApi.updateAccount;
  deleteAccount: typeof originalApi.deleteAccount;
};

// 创建上下文，默认值为原始API函数
export const ApiFixContext = createContext<ApiFixContextType>({
  ...originalApi,
  getIncomeTypes,
  getExpenseTypes,
  getAllTransactionTypes,
  getSubjectTypes,
  getSubjectType,
  getAssetTypes,
  getAssetType,
  getAccounts,
  getAccount,
});

// Provider组件
export const ApiFixProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  // 使用useMemo缓存API函数，避免不必要的重渲染
  const apiValues = useMemo(() => ({
    ...originalApi, // 使用已经修复的原始API函数
    // 使用修复版的函数覆盖有问题的函数
    getIncomeTypes,
    getExpenseTypes,
    getAllTransactionTypes,
    getSubjectTypes,
    getSubjectType,
    getAssetTypes,
    getAssetType,
    getAccounts,
    getAccount,
  }), []);

  return (
    <ApiFixContext.Provider value={apiValues}>
      {children}
    </ApiFixContext.Provider>
  );
};

// 创建自定义Hook，方便使用
export const useApiFixed = () => useContext(ApiFixContext);