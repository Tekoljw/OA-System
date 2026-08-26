import React, { useState, useEffect } from 'react';
import { directAPI, initializeAPI, getCurrentProjectId } from '../utils/direct-api';

// API测试组件 - 直接测试后端API连接
const ApiTester = () => {
  const [loading, setLoading] = useState(false);
  const [currencyTypes, setCurrencyTypes] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [projectId, setProjectId] = useState(2);
  const [apiStatus, setApiStatus] = useState('未测试');

  // 初始化API连接
  useEffect(() => {
    const apiHelper = initializeAPI();
    const storedProjectId = getCurrentProjectId();
    if (storedProjectId) {
      setProjectId(storedProjectId);
    }

    // 测试连接
    const testConnection = async () => {
      try {
        setApiStatus('测试中...');
        const result = await apiHelper.testConnection();
        setApiStatus(result.success ? '连接成功' : '连接失败');
      } catch (err) {
        setApiStatus('连接失败');
        console.error('API测试失败:', err);
      }
    };

    testConnection();
  }, []);

  // 加载币种列表
  const loadCurrencyTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await directAPI.getCurrencyTypes(projectId);
      setCurrencyTypes(data);
    } catch (err) {
      setError('加载币种列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 加载账户类型列表
  const loadAccountTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await directAPI.getAccountTypes(projectId);
      setAccountTypes(data);
    } catch (err) {
      setError('加载账户类型列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 加载账户列表
  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await directAPI.getAccounts(projectId);
      setAccounts(data);
    } catch (err) {
      setError('加载账户列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 加载所有数据
  const loadAllData = () => {
    loadCurrencyTypes();
    loadAccountTypes();
    loadAccounts();
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4">API连接测试</h2>
      
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium">API状态:</span>
          <span className={`px-2 py-1 rounded-full text-sm ${
            apiStatus === '连接成功' ? 'bg-green-100 text-green-800' : 
            apiStatus === '测试中...' ? 'bg-blue-100 text-blue-800' : 
            'bg-red-100 text-red-800'
          }`}>
            {apiStatus}
          </span>
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <span className="font-medium">项目ID:</span>
          <input 
            type="number" 
            value={projectId} 
            onChange={(e) => setProjectId(Number(e.target.value))}
            className="border rounded px-2 py-1 w-16"
          />
        </div>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <button 
            onClick={loadCurrencyTypes} 
            disabled={loading}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 text-sm"
          >
            测试币种API
          </button>
          <button 
            onClick={loadAccountTypes} 
            disabled={loading}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 text-sm"
          >
            测试账户类型API
          </button>
          <button 
            onClick={loadAccounts} 
            disabled={loading}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 text-sm"
          >
            测试账户API
          </button>
          <button 
            onClick={loadAllData} 
            disabled={loading}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 text-sm"
          >
            测试所有API
          </button>
        </div>
      </div>
      
      {loading && (
        <div className="flex justify-center my-4">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-md p-3">
          <h3 className="font-medium mb-2">币种列表 ({currencyTypes.length})</h3>
          {currencyTypes.length > 0 ? (
            <ul className="text-sm">
              {currencyTypes.map(ct => (
                <li key={ct.id} className="mb-1 p-1 hover:bg-gray-50">
                  {ct.name} ({ct.code})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">无数据</p>
          )}
        </div>
        
        <div className="border rounded-md p-3">
          <h3 className="font-medium mb-2">账户类型 ({accountTypes.length})</h3>
          {accountTypes.length > 0 ? (
            <ul className="text-sm">
              {accountTypes.map(at => (
                <li key={at.id} className="mb-1 p-1 hover:bg-gray-50">
                  {at.name} ({at.type})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">无数据</p>
          )}
        </div>
        
        <div className="border rounded-md p-3">
          <h3 className="font-medium mb-2">账户列表 ({accounts.length})</h3>
          {accounts.length > 0 ? (
            <ul className="text-sm">
              {accounts.map(acc => (
                <li key={acc.id} className="mb-1 p-1 hover:bg-gray-50">
                  {acc.name} (余额: {acc.balance})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">无数据</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiTester;