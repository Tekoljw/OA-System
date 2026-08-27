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
    console.log('正在加载真实PostgreSQL活动日志数据...');
    
    const response = await fetch('/activity-logs-data.json');
    const data = await response.json();
    
    if (!data.success || !Array.isArray(data.logs)) {
      throw new Error('活动日志数据格式错误');
    }

    let filteredLogs = [...data.logs];
    
    // 应用操作类型过滤
    if (params.action && params.action !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.action === params.action);
    }
    
    // 应用搜索过滤
    if (params.search) {
      const searchTerm = params.search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.details.toLowerCase().includes(searchTerm) ||
        log.action.toLowerCase().includes(searchTerm)
      );
    }
    
    // 应用日期过滤
    if (params.dateFilter) {
      const filterDate = params.dateFilter;
      filteredLogs = filteredLogs.filter(log => 
        log.created_at.startsWith(filterDate)
      );
    }

    // 计算分页
    const page = params.page || 1;
    const limit = params.limit || 20;
    const total = filteredLogs.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pagedLogs = filteredLogs.slice(startIndex, endIndex);

    // 转换数据格式
    const logs = pagedLogs.map(log => ({
      id: log.id.toString(),
      timestamp: log.created_at,
      username: `用户${log.user_id}`,
      action: log.action,
      details: log.details,
      entityType: log.entity_type,
      entityId: log.entity_id,
      ipAddress: log.ip_address,
      userAgent: log.user_agent
    }));
    
    // 获取所有唯一的操作类型
    const actions = [...new Set(data.logs.map(log => log.action))];
    
    console.log('成功加载活动日志:', logs.length, '条记录');
    
    return {
      logs,
      pagination: {
        total,
        page,
        totalPages,
        pageSize: limit
      },
      actions
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