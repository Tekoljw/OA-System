/**
 * 转账数据API工具函数
 */

import { fetchAPI } from './api';

// 转账数据接口
export interface TransferData {
  id: string;
  fromAccount: string;
  fromCurrency: string;
  amount: number;
  actualExchangeRate: number | null;
  officialExchangeRate: number | null;
  toAccount: string;
  toCurrency: string;
  toAmount: number;
  submitter: string;
  submitTime: string;
  approver: string;
  approveTime: string;
  fees: number;
  exchangeLoss: number;
  reason: string;
  status: string;
  projectId?: number;
}

// 获取转账列表
export async function getTransfers(params: {
  status?: string;
  page?: number;
  limit?: number;
  searchTerm?: string;
  date?: string;
}): Promise<{
  transfers: TransferData[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    console.log('获取转账列表:', params);
    const queryParams = new URLSearchParams();
    
    // 添加查询参数
    if (params.status) queryParams.append('status', params.status);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.searchTerm) queryParams.append('searchTerm', params.searchTerm);
    if (params.date) queryParams.append('date', params.date);
    
    const url = `/api/transfers${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetchAPI(url);
    
    if (response.success) {
      console.log('获取转账列表成功:', response.data);
      return response.data;
    } else {
      throw new Error(response.message || '获取转账列表失败');
    }
  } catch (error) {
    console.error('获取转账列表异常:', error);
    return {
      transfers: [],
      total: 0,
      page: 1,
      limit: 10
    };
  }
}

// 获取转账详情
export async function getTransfer(id: string): Promise<TransferData> {
  try {
    const response = await fetchAPI(`/api/transfers/${id}`);
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '获取转账详情失败');
    }
  } catch (error) {
    console.error(`获取转账详情(ID: ${id})异常:`, error);
    throw error;
  }
}

// 创建新转账
export async function createTransfer(data: Omit<TransferData, 'id' | 'submitTime' | 'approver' | 'approveTime'>): Promise<TransferData> {
  try {
    const response = await fetchAPI('/api/transfers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '创建转账失败');
    }
  } catch (error) {
    console.error('创建转账异常:', error);
    throw error;
  }
}

// 更新转账状态
export async function updateTransferStatus(id: string, status: string): Promise<TransferData> {
  try {
    const response = await fetchAPI(`/api/transfers/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '更新转账状态失败');
    }
  } catch (error) {
    console.error(`更新转账状态(ID: ${id})异常:`, error);
    throw error;
  }
}

// 批准转账
export async function approveTransfer(id: string, comment: string): Promise<TransferData> {
  try {
    const response = await fetchAPI(`/api/transfers/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '批准转账失败');
    }
  } catch (error) {
    console.error(`批准转账(ID: ${id})异常:`, error);
    throw error;
  }
}

// 拒绝转账
export async function rejectTransfer(id: string, comment: string): Promise<TransferData> {
  try {
    const response = await fetchAPI(`/api/transfers/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '拒绝转账失败');
    }
  } catch (error) {
    console.error(`拒绝转账(ID: ${id})异常:`, error);
    throw error;
  }
}

// 执行转账
export async function executeTransfer(id: string): Promise<TransferData> {
  try {
    const response = await fetchAPI(`/api/transfers/${id}/execute`, {
      method: 'POST'
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '执行转账失败');
    }
  } catch (error) {
    console.error(`执行转账(ID: ${id})异常:`, error);
    throw error;
  }
}