/**
 * 交易记录API工具函数
 * 处理与后端交易记录API的通信
 */

import { apiRequest } from '../api/client';

// 交易记录类型定义
export interface TransactionData {
  id: string | number;
  currency: string;
  type: "收入" | "支出";
  category: string;
  subject: string;
  department: string;
  description: string;
  submitter: string;
  submitTime: string;
  approver: string | null;
  approveTime: string | null;
  amount: number;
  balance: number;
  status: string;
  accountId?: number;
}

export interface TransactionListResponse {
  transactions: TransactionData[];
  total: number;
  page: number;
  limit: number;
}

export interface TransactionQueryParams {
  currency?: string;
  type?: string;
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * 获取交易记录列表
 * @param params 查询参数
 * @returns 交易记录列表响应
 */
export async function getTransactions(params: TransactionQueryParams = {}): Promise<TransactionListResponse> {
  try {
    // 构建查询字符串
    const queryParams = new URLSearchParams();
    
    // 添加查询参数
    if (params.currency) queryParams.append('currency', params.currency);
    if (params.type) queryParams.append('type', params.type);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    
    const queryString = queryParams.toString();
    const url = `/api/transactions${queryString ? `?${queryString}` : ''}`;
    
    console.log('--- 交易记录API调用开始 ---');
    console.log('获取交易记录列表 URL:', url);
    console.log('查询参数:', params);
    
    try {
      const response = await apiRequest('GET', url);
      console.log('API响应状态:', response ? '成功' : '失败');
      console.log('API响应数据:', response);
      
      if (response && response.success) {
        // 注意: 后端API返回的结构与前端预期可能不匹配，需要进行转换
        // 从API响应中提取出我们需要的数据结构
        const result: TransactionListResponse = {
          transactions: [], // 默认为空数组
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10
        };
        
        // 处理API响应数据
        if (response.data) {
          // 如果API返回的是我们期望的TransactionListResponse结构
          if (response.data.transactions) {
            result.transactions = response.data.transactions;
            result.total = response.data.total || 0;
            result.page = response.data.page || params.page || 1;
            result.limit = response.data.limit || params.limit || 10;
          } 
          // 如果API以不同的字段名返回数据，需要进行映射
          else if (Array.isArray(response.data)) {
            // 如果直接返回数组
            result.transactions = response.data;
            result.total = response.data.length;
          } 
          // 其他可能的响应结构
          else if (typeof response.data === 'object') {
            if (response.data.records) {
              // 如果字段名不同但结构类似
              result.transactions = response.data.records;
              result.total = response.data.total || 0;
              result.page = response.data.page || params.page || 1;
              result.limit = response.data.limit || params.limit || 10; 
            }
          }
        }
        
        console.log(`获取到${result.transactions.length}条交易记录，总数${result.total}`);
        console.log('转换后的数据:', result);
        return result;
      } else {
        console.error('API响应错误:', response?.message || '未知错误');
        throw new Error(response?.message || '获取交易记录失败');
      }
    } catch (apiError) {
      console.error('API请求执行错误:', apiError);
      throw apiError;
    } finally {
      console.log('--- 交易记录API调用结束 ---');
    }
  } catch (error: any) {
    console.error('获取交易记录错误:', error);
    throw error;
  }
}

/**
 * 获取单个交易记录详情
 * @param id 交易记录ID
 * @returns 交易记录详情
 */
export async function getTransactionById(id: string | number): Promise<TransactionData> {
  try {
    console.log('获取交易记录详情:', id);
    
    const response = await apiRequest('GET', `/api/transactions/${id}`);
    console.log('交易记录详情响应:', response);
    
    if (response && response.success) {
      // 直接返回响应中的data字段
      if (response.data) {
        return response.data as TransactionData;
      } else {
        throw new Error('获取交易记录详情失败: 响应数据为空');
      }
    } else {
      throw new Error(response?.message || '获取交易记录详情失败');
    }
  } catch (error: any) {
    console.error('获取交易记录详情错误:', error);
    throw error;
  }
}

/**
 * 创建新交易记录
 * @param data 交易记录数据
 * @returns 创建的交易记录
 */
export async function createTransaction(data: Partial<TransactionData>): Promise<TransactionData> {
  try {
    console.log('创建交易记录:', data);
    
    const response = await apiRequest('POST', '/api/transactions', data);
    
    if (response && response.success) {
      return response.data as TransactionData;
    } else {
      throw new Error(response?.message || '创建交易记录失败');
    }
  } catch (error: any) {
    console.error('创建交易记录错误:', error);
    throw error;
  }
}

/**
 * 更新交易记录状态
 * @param id 交易记录ID
 * @param status 新状态
 * @param approverId 审批人ID
 * @returns 更新后的交易记录
 */
export async function updateTransactionStatus(
  id: string | number, 
  status: string, 
  approverId?: number
): Promise<TransactionData> {
  try {
    console.log('更新交易记录状态:', { id, status, approverId });
    
    const data = { status, approverId };
    const response = await apiRequest('PATCH', `/api/transactions/${id}/status`, data);
    
    if (response && response.success) {
      return response.data as TransactionData;
    } else {
      throw new Error(response?.message || '更新交易记录状态失败');
    }
  } catch (error: any) {
    console.error('更新交易记录状态错误:', error);
    throw error;
  }
}