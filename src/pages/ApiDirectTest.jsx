import React from 'react';
import ApiTester from '../components/ApiTester';

// 直接API测试页面
const ApiDirectTest = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">直接API连接测试</h1>
      <p className="mb-4 text-gray-600">
        本页面使用直接API连接绕过Vite开发服务器，直接连接PHP后端进行测试。
      </p>
      
      <ApiTester />
    </div>
  );
};

export default ApiDirectTest;