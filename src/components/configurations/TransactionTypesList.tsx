
import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useIsMobile } from "../../hooks/use-mobile";
import { ArrowDownIcon, ArrowUpIcon, Tag, FileText, HelpCircle, Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import LoadingState from "../common/LoadingState";
import { TransactionType, getIncomeTypes, getExpenseTypes } from "../../utils/config-api";

const TransactionTypesList = () => {
  const isMobile = useIsMobile();
  const { isLoggedIn } = useAuth();
  const [incomeTypes, setIncomeTypes] = useState<TransactionType[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<TransactionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (isLoggedIn) {
      const fetchTransactionTypes = async () => {
        try {
          setIsLoading(true);
          setError(null);
          
          // 使用API工具函数获取流水类型数据
          let incomeTypesData = await getIncomeTypes();
          let expenseTypesData = await getExpenseTypes();
          
          setIncomeTypes(Array.isArray(incomeTypesData) ? incomeTypesData : []);
          setExpenseTypes(Array.isArray(expenseTypesData) ? expenseTypesData : []);
        } catch (err) {
          console.error("获取流水类型失败:", err);
          
          // 记录错误并显示明确的错误消息
          console.error("API调用失败，无法获取流水类型数据");
          
          // 设置为空数组，不使用离线数据
          setIncomeTypes([]);
          setExpenseTypes([]);
          
          // 设置明确的错误状态
          setError("获取数据失败，请检查网络连接后重试");
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchTransactionTypes();
    }
  }, [isLoggedIn]);
  
  // 无数据时显示的组件
  const NoDataDisplay = ({title}: {title: string}) => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <HelpCircle className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无{title}数据
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          系统默认{title}类型将在此显示
        </p>
      </div>
    </Card>
  );
  
  if (isLoading) {
    return <LoadingState title="正在加载流水类型数据" />;
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <HelpCircle className="h-10 w-10 text-red-500 mb-4" />
        <h3 className="text-lg font-medium mb-2">获取数据失败</h3>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpIcon className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-medium">收入流水类型</h3>
        </div>
        
        {incomeTypes.length === 0 ? (
          <NoDataDisplay title="收入流水类型" />
        ) : (
          <Card>
            <CardContent className="p-0">
              {isMobile ? (
                <div className="grid gap-4 p-4">
                  {incomeTypes.map((type) => (
                    <Card key={type.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-green-500" />
                            <div className="font-medium">{type.name}</div>
                          </div>
                          <div className="text-sm text-muted-foreground pl-6">
                            {type.description}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型名称</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeTypes.map((type) => (
                      <TableRow key={type.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-green-500" />
                            <span>{type.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{type.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownIcon className="h-5 w-5 text-red-500" />
          <h3 className="text-lg font-medium">支出流水类型</h3>
        </div>
        
        {expenseTypes.length === 0 ? (
          <NoDataDisplay title="支出流水类型" />
        ) : (
          <Card>
            <CardContent className="p-0">
              {isMobile ? (
                <div className="grid gap-4 p-4">
                  {expenseTypes.map((type) => (
                    <Card key={type.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-red-500" />
                            <div className="font-medium">{type.name}</div>
                          </div>
                          <div className="text-sm text-muted-foreground pl-6">
                            {type.description}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型名称</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseTypes.map((type) => (
                      <TableRow key={type.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-red-500" />
                            <span>{type.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{type.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TransactionTypesList;
