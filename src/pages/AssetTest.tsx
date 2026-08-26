import React, { useState, useEffect } from 'react';
import PageLayout from '../components/layout/PageLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loader2 } from 'lucide-react';

// 简单的资产测试页面
const AssetTest = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 获取项目ID
      let projectId = 1;
      const projectData = localStorage.getItem('currentProject');
      if (projectData) {
        try {
          const project = JSON.parse(projectData);
          projectId = project.id;
        } catch (e) {
          console.error('解析项目ID出错:', e);
        }
      }
      
      // 使用本地JSON文件作为数据源
      console.log('使用本地JSON数据');
      const response = await fetch('/asset-data.json');
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('PHP API返回数据:', result);
      setData(result);
    } catch (err: any) {
      console.error('获取资产数据出错:', err);
      setError(err.message || '获取资产数据失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout title="资产数据测试" subtitle="测试PHP后端数据获取">
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex gap-4">
              <Button onClick={fetchAssets} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    加载中...
                  </>
                ) : '获取资产数据'}
              </Button>
              
              {error && (
                <div className="text-red-500 flex items-center">
                  错误: {error}
                </div>
              )}
            </div>
            
            {data && (
              <div>
                <h3 className="text-lg font-medium mb-2">数据结果:</h3>
                <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">
                  {JSON.stringify(data, null, 2)}
                </pre>
                
                {data.success && data.data.assets.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-lg font-medium mb-2">资产列表:</h3>
                    <div className="grid gap-4">
                      {data.data.assets.map((asset: any) => (
                        <div key={asset.id} className="border p-4 rounded">
                          <h4 className="font-medium">{asset.name}</h4>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div><span className="text-gray-500">ID:</span> {asset.id}</div>
                            <div><span className="text-gray-500">类型:</span> {asset.type}</div>
                            <div><span className="text-gray-500">数量:</span> {asset.quantity}</div>
                            <div><span className="text-gray-500">总价:</span> {asset.total_price} {asset.currency_type}</div>
                            <div><span className="text-gray-500">部门:</span> {asset.department}</div>
                            <div><span className="text-gray-500">状态:</span> {asset.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
};

export default AssetTest;