import axios from 'axios';

const API_PATH = '/api';

/**
 * 审批应用
 * @param id 应用ID
 * @param status 审批状态 ('approved' | 'rejected' | 'ready_for_execution')
 * @param comment 审批意见
 * @returns 
 */
export const approveApplication = async (id: number, status: string, comment: string = '') => {
  try {
    console.log(`发起审批请求：ID=${id}, 状态=${status}, 评论=${comment}`);
    console.log(`请求URL: ${API_PATH}/applications/${id}/status`);
    
    // 构建请求数据
    const requestData = {
      status,
      comment,
      // 如果是approved状态，我们将其转为ready_for_execution (待归账)
      nextStatus: status === 'approved' ? 'ready_for_execution' : undefined
    };
    
    console.log('请求数据:', requestData);
    
    // 使用相对路径，让代理服务器正确处理
    const response = await axios.put(`${API_PATH}/applications/${id}/status`, requestData);
    
    console.log('审批响应:', response.data);
    return response.data;
  } catch (error) {
    console.error('审批失败:', error);
    throw error;
  }
};

/**
 * 执行归账操作
 * @param id 应用ID
 * @param comment 执行意见
 * @returns 
 */
export const executeApplication = async (id: number, comment: string = '') => {
  try {
    console.log(`发起执行归账请求：ID=${id}, 评论=${comment}`);
    
    // 使用相对路径，让代理服务器正确处理
    const response = await axios.put(`${API_PATH}/applications/${id}/execute`, {
      comment
    });
    
    console.log('执行归账响应:', response.data);
    return response.data;
  } catch (error) {
    console.error('执行归账操作失败:', error);
    throw error;
  }
};