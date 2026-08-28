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
    const token = localStorage.getItem('token');
    const projectData = localStorage.getItem('currentProject');
    const projectId = projectData ? JSON.parse(projectData).id : 1;
    const response = await fetch(`/api/departments?projectId=${projectId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const result = await response.json();

    if (result && result.success) {
      return {
        success: true,
        departments: result.data || []
      };
    } else {
      throw new Error(result.error?.message || '部门数据格式错误');
    }
  } catch (error: any) {
    console.error('获取部门列表错误:', error);
    return { success: false, message: '获取部门列表失败，请稍后再试' };
  }
}