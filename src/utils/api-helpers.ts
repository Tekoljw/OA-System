// 资产API助手

/**
 * 获取资产列表
 * @param projectId 项目ID
 * @returns 资产数据
 */
export async function getAssets(projectId?: number) {
  try {
    // 从PHP后端获取真实数据库数据
    // 使用我们已知工作的端点
    const url = `/api/get-real-assets.php${projectId ? `?projectId=${projectId}` : ''}`;
    console.log('从数据库获取资产数据, 请求URL:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`获取资产数据失败: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('获取资产列表失败:', error);
    throw error;
  }
}