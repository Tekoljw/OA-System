/**
 * 申请数据API工具函数
 */

import { fetchAPI } from './api';

// 申请数据接口
export interface Application {
  id: number;
  type: string;
  title: string;
  amount: number;
  status: string;
  date: string;
  department: string;
  submitter?: string;
  userId?: number;
  createdAt?: string;
  updatedAt?: string;
  images?: string[]; // 图片可能来自前端临时添加，不一定存在于数据库
}

// 获取申请列表
export async function getApplications(params: {
  type?: string;
  page?: number;
  limit?: number;
  searchTerm?: string;
  date?: string;
  /** 只看当前登录用户提交的申请；后端按登录身份收敛，不接受指定他人 */
  mine?: boolean;
}): Promise<{
  applications: Application[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    console.log('获取申请列表:', params);
    const queryParams = new URLSearchParams();
    
    // 添加查询参数
    if (params.type) queryParams.append('type', params.type);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.searchTerm) queryParams.append('searchTerm', params.searchTerm);
    if (params.date) queryParams.append('date', params.date);
    if (params.mine) queryParams.append('mine', '1');
    
    const url = `/api/applications${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetchAPI(url);
    
    if (response.success) {
      console.log('获取申请列表成功:', response.data);
      return response.data;
    } else {
      throw new Error(response.message || '获取申请列表失败');
    }
  } catch (error) {
    console.error('获取申请列表异常:', error);
    throw error;
  }
}

// 获取申请详情
export async function getApplication(id: number): Promise<Application> {
  try {
    const response = await fetchAPI(`/api/applications/${id}`);
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '获取申请详情失败');
    }
  } catch (error) {
    console.error(`获取申请详情(ID: ${id})异常:`, error);
    throw error;
  }
}

// 创建新申请
export async function createApplication(data: {
  /** 后端只接受 income / expense */
  type: string;
  title: string;
  amount: number;
  /** 审批链第一级是部门主管，必须传部门 id 而非部门名 */
  departmentId?: number;
  userId?: number;
  images?: string[];
  content?: string;
  description?: string; // 备注说明
  applicationType?: 'payment' | 'income' | 'purchase' | 'sales' | 'borrowing' | 'lending'; // 申请类型
  relatedParty?: string; // 关联方（供应商/客户）
  dueDate?: string; // 期限日期
}): Promise<Application> {
  try {
    // 重命名 userId 为 submitterId 以匹配后端 API 期望
    const submitData = {
      ...data,
      submitterId: data.userId,
      // 添加申请类型和自动生成流水类型的标记
      generateTransaction: true // 标记需要自动生成流水记录
    };
    
    console.log('提交申请数据:', submitData);
    
    const response = await fetchAPI('/api/applications', {
      method: 'POST',
      body: JSON.stringify(submitData)
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '创建申请失败');
    }
  } catch (error) {
    console.error('创建申请异常:', error);
    throw error;
  }
}

// 更新申请状态
export async function updateApplicationStatus(id: number, status: string): Promise<Application> {
  try {
    const response = await fetchAPI(`/api/applications/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.message || '更新申请状态失败');
    }
  } catch (error) {
    console.error(`更新申请状态(ID: ${id})异常:`, error);
    throw error;
  }
}

// 删除申请
export async function deleteApplication(id: number): Promise<void> {
  try {
    const response = await fetchAPI(`/api/applications/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.success) {
      throw new Error(response.message || '删除申请失败');
    }
  } catch (error) {
    console.error(`删除申请(ID: ${id})异常:`, error);
    throw error;
  }
}