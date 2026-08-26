/**
 * 部门API功能
 * 提供获取和管理部门数据的功能
 */

// 从API配置中导入基础URL配置
import { API_BASE_URL } from "./api";

// 部门类型定义
export interface Department {
  id: string | number;
  name: string;
  code?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 获取部门列表
 * 返回系统中所有部门信息
 */
export async function getDepartments() {
  try {
    // 直接从本地数据文件获取部门信息
    const response = await fetch('/departments-data.json');
    const result = await response.json();
    
    console.log('加载部门列表成功:', result.departments);
    
    if (result && result.success && result.departments) {
      return {
        success: true,
        departments: result.departments
      };
    } else {
      throw new Error('部门数据格式错误');
    }
  } catch (error: any) {
    console.error('获取部门列表错误:', error);
    return { success: false, message: '获取部门列表失败，请稍后再试' };
  }
}