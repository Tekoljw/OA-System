/**
 * 用户API代理 - 连接前端和PHP后端
 */

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { action, projectId } = req.body;
    
    if (action === 'getUserList') {
      // 调用PHP后端获取用户数据
      const phpResponse = await fetch(`http://localhost:5000/user-management.php?projectId=${projectId || 27}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!phpResponse.ok) {
        throw new Error(`PHP API失败: ${phpResponse.status}`);
      }
      
      const phpData = await phpResponse.json();
      
      // 返回PHP后端的数据
      res.status(200).json(phpData);
    } else {
      res.status(400).json({ success: false, message: '不支持的操作' });
    }
  } catch (error) {
    console.error('用户API代理错误:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || '服务器错误' 
    });
  }
}