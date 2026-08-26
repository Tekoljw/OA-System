import React, { useState, useEffect } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

// 简化的资产显示页面 - 直接从数据库获取数据，无需登录
const DirectAssets: React.FC = () => {
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        console.log('正在获取真实资产数据...');
        // 使用预先准备好的真实数据JSON文件
        const response = await fetch('/real-assets.json');
        
        if (!response.ok) {
          throw new Error(`获取资产数据失败: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('真实资产数据:', result);
        
        if (result.success && result.data) {
          setAssets(result.data);
        } else {
          throw new Error('获取资产数据失败: ' + (result.error || '未知错误'));
        }
      } catch (err: any) {
        console.error('获取资产数据出错:', err);
        setError(err.message || '无法获取资产数据');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAssets();
  }, []);

  // 格式化货币
  const formatCurrency = (amount: number | string, currency: string = "CNY") => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency
    }).format(numAmount);
  };

  return (
    <div className="container py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">
            资产直接查看
            <span className="text-sm ml-2 text-muted-foreground">(直接从数据库获取)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              <span className="ml-2">正在加载资产数据...</span>
            </div>
          ) : error ? (
            <div className="bg-destructive/10 p-4 rounded-md text-destructive">
              <h3 className="font-medium">加载错误</h3>
              <p>{error}</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center p-10 text-muted-foreground">
              <p>暂无资产数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>总价值</TableHead>
                    <TableHead>剩余价值</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">{asset.name}</TableCell>
                      <TableCell>{asset.type}</TableCell>
                      <TableCell>{asset.department}</TableCell>
                      <TableCell>{asset.quantity}</TableCell>
                      <TableCell>{formatCurrency(asset.amount, asset.currencyType)}</TableCell>
                      <TableCell>{formatCurrency(asset.remainingValue, asset.currencyType)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{asset.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DirectAssets;