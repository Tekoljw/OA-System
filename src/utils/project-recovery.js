// 项目恢复工具 - 直接在浏览器中运行
function recoverProjects() {
  const defaultProject = {
    id: 1,
    name: "默认项目",
    code: "default",
    description: "系统默认项目",
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // 恢复项目列表
  localStorage.setItem('projects', JSON.stringify([defaultProject]));
  localStorage.setItem('currentProject', JSON.stringify(defaultProject));
  
  // 恢复用户登录状态
  const user = {
    id: 1,
    username: "phpuser",
    fullName: "PHP用户",
    role: "管理员",
    isSuperAdmin: true,
    projectId: 1
  };
  
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('user', JSON.stringify(user));
  
  console.log('项目已恢复！');
  window.location.reload();
}

// 自动执行恢复
recoverProjects();
