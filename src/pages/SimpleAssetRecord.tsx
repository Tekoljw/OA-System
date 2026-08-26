import React, { useState, useEffect } from "react";
import PageLayout from "../components/layout/PageLayout";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Computer, Loader2 } from "lucide-react";

// 简化版的资产组件，确保能从PHP后端获取数据
const AssetRecordsContent: React.FC = () => {
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssets();
  }, []);

  // 获取资产数据的函数
  const fetchAssets = async () => {
    setIsLoading(true);
    
    try {
      // 确定当前项目ID
      let projectId = 1;
      try {
        const projectData = localStorage.getItem('currentProject');
        if (projectData) {
          const project = JSON.parse(projectData);
          projectId = project.id;
        }
      } catch (e) {
        console.error('解析项目ID出错:', e);
      }
      
      console.log('使用项目ID:', projectId);
      
      // 直接从PHP API获取数据
      const apiUrl = `http://localhost:5000/get_assets.php?projectId=${projectId}`;
      console.log('API请求URL:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors', // 确保启用CORS
        cache: 'no-cache' // 避免缓存问题
      });
      
      if (!response.ok) {
        throw new Error(`请求失败，状态码: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('获取到的资产数据:', data);
      
      if (data.success) {
        setAssets(data.data.assets || []);
      } else {
        throw new Error('获取资产列表失败');
      }
    } catch (err: any) {
      console.error('获取资产列表出错:', err);
      setError(err.message || '获取失败，请稍后重试');
      setAssets([]); // 出错时使用空数组
    } finally {
      setIsLoading(false);
    }
  };

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case "使用中":
        return "bg-green-100 text-green-800";
      case "待审批":
        return "bg-yellow-100 text-yellow-800";
      case "处理中":
        return "bg-blue-100 text-blue-800";
      case "已报废":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // 格式化货币
  const formatCurrency = (amount: number | string, currency: string = "CNY") => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency
    }).format(numAmount);
  };

  // 空数据显示组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <Computer className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无资产记录
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          当有新的资产记录时，将会显示在这里
        </p>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="computers">电脑设备</TabsTrigger>
          <TabsTrigger value="others">其他设备</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="outline-none">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">正在加载资产数据...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64">
              <p className="text-red-500 mb-2">加载失败: {error}</p>
              <Button onClick={fetchAssets} variant="outline">重试</Button>
            </div>
          ) : assets.length === 0 ? (
            <NoDataDisplay />
          ) : (
            <Table className="border rounded-md">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>资产名称</TableHead>
                  <TableHead>资产类型</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{asset.id}</TableCell>
                    <TableCell>{asset.name}</TableCell>
                    <TableCell>{asset.type}</TableCell>
                    <TableCell>{asset.quantity}</TableCell>
                    <TableCell>{formatCurrency(asset.total_price, asset.currency_type)}</TableCell>
                    <TableCell>{asset.department}</TableCell>
                    <TableCell>
                      <Badge className={getStatusStyle(asset.status)}>
                        {asset.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{asset.submitted_at?.split(' ')[0] || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        
        <TabsContent value="computers">
          <NoDataDisplay />
        </TabsContent>
        
        <TabsContent value="others">
          <NoDataDisplay />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const SimpleAssetRecord: React.FC = () => {
  return (
    <PageLayout title="资产记录" subtitle="管理和维护公司资产">
      <div className="container mx-auto py-4">
        <AssetRecordsContent />
      </div>
    </PageLayout>
  );
};

export default SimpleAssetRecord;