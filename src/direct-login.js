/**
 * 直接登录工具 - 无需API调用
 * 当PHP后端连接不稳定时使用此工具进行登录
 */

// 创建一个直接登录功能，将数据写入localStorage
function directLogin() {
  try {
    // 创建默认管理员用户信息
    const adminUser = {
      id: 1,
      username: 'phpuser',
      fullName: '系统用户',
      role: 'admin',
      isSuperAdmin: true,
      projectsCount: 2,
      hasProjects: true,
      projectsData: "演示项目",
      token: 'direct-login-token-' + Date.now()
    };

    // 创建默认项目信息
    const defaultProjects = [
      {
        id: 1,
        name: "演示项目",
        code: "default",
        description: "系统演示项目",
        active: true
      },
      {
        id: 449,
        name: "测试",
        code: "test",
        description: "新建项目",
        active: true
      }
    ];

    // 创建当前项目信息
    const currentProject = defaultProjects[0];

    // 写入本地存储，创建登录状态
    localStorage.setItem('user', JSON.stringify(adminUser));
    localStorage.setItem('token', adminUser.token);
    localStorage.setItem('projects', JSON.stringify(defaultProjects));
    localStorage.setItem('currentProject', JSON.stringify(currentProject));
    
    console.log('直接登录成功，用户信息已写入');
    
    // 返回成功状态和用户信息
    return {
      success: true,
      user: adminUser,
      projects: defaultProjects,
      currentProject: currentProject
    };
  } catch (error) {
    console.error('直接登录失败:', error);
    return {
      success: false,
      message: '直接登录失败: ' + (error.message || '未知错误')
    };
  }
}

// 导出函数供其他组件使用
export default directLogin;