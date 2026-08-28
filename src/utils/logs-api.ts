import { getCurrentProjectId } from '../api/client';

// 定义活动日志数据接口
export interface ActivityLog {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  details: string;
  entityType?: string;
  entityId?: number;
  ipAddress?: string;
  userAgent?: string;
}

// 定义分页数据接口
export interface PaginationData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// 定义日志查询参数接口
export interface LogsQueryParams {
  action?: string;
  page?: number;
  limit?: number;
  search?: string;
  dateFilter?: string;
}

/**
 * 获取活动日志列表
 * @param params 查询参数
 * @returns 返回活动日志列表和分页信息
 */
export const getActivityLogs = async (params: LogsQueryParams = {}) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('未授权，请先登录');

    const projectId = getCurrentProjectId();
    const queryParams = new URLSearchParams();
    queryParams.append('projectId', String(projectId));
    queryParams.append('page', String(params.page || 1));
    queryParams.append('limit', String(params.limit || 20));
    if (params.action && params.action !== 'all') {
      queryParams.append('action', params.action);
    }
    if (params.search) {
      queryParams.append('search', params.search);
    }
    if (params.dateFilter) {
      queryParams.append('dateFilter', params.dateFilter);
    }

    const response = await fetch(`/api/activity-logs?${queryParams.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`获取活动日志失败: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || '获取活动日志失败');
    }

    const rawLogs = result.data || [];
    const pagination = result.pagination || { total: rawLogs.length, page: 1, pages: 1, limit: 20 };

    // 转换数据格式
    const logs = rawLogs.map((log: any) => ({
      id: String(log.id),
      timestamp: log.created_at,
      username: log.username || `用户${log.user_id}`,
      action: log.action,
      details: log.description || log.details || '',
      entityType: log.target_type || log.entity_type,
      entityId: log.target_id || log.entity_id,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
    }));

    // 获取所有唯一的操作类型
    const actions = [...new Set(rawLogs.map((log: any) => log.action))];

    return {
      logs,
      pagination: {
        total: pagination.total,
        page: pagination.page,
        totalPages: pagination.pages,
        pageSize: pagination.limit,
      },
      actions,
    };
  } catch (error) {
    console.error('获取活动日志失败:', error);
    throw error;
  }
};

/**
 * 添加活动日志记录
 * @param logData 日志数据
 * @returns 添加的日志记录
 */
export const addActivityLog = async (logData: Omit<ActivityLog, 'id' | 'timestamp'>) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('未授权，请先登录');
    }

    const response = await fetch(`/api/activity-logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logData)
    });

    if (!response.ok) {
      throw new Error(`添加活动日志失败 (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || '添加活动日志失败');
    }

    return data.data;
  } catch (error) {
    console.error('添加活动日志失败:', error);
    throw error;
  }
};
