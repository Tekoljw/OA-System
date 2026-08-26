
import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Plus, Edit, Trash2, FileQuestion, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { Card, CardContent } from "../ui/card";
import { useIsMobile } from "../../hooks/use-mobile";
import { 
  CurrencyType, 
  getCurrencyTypes, 
  createCurrencyType, 
  updateCurrencyType, 
  deleteCurrencyType 
} from "../../utils/config-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";

const CurrencyTypeManager = () => {
  const [currencies, setCurrencies] = useState<CurrencyType[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyType | null>(null);
  const [deletingCurrencyId, setDeletingCurrencyId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", description: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // 默认币种数据 - 仅在API完全无法访问时使用
  const DEFAULT_CURRENCIES: CurrencyType[] = [
    { id: "56", code: "CNY", name: "人民币", description: "中国法定货币" },
    { id: "57", code: "USD", name: "美元", description: "美国法定货币" }
  ];

  // 获取币种数据
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        setIsLoading(true);
        console.log("开始获取币种列表...");
        
        // 重试机制
        let attempts = 0;
        const maxAttempts = 3;
        let success = false;
        let data = [];
        
        while (attempts < maxAttempts && !success) {
          try {
            attempts++;
            console.log(`尝试获取币种列表 (第${attempts}次尝试)...`);
            
            // 添加随机参数避免缓存
            const timestamp = Date.now();
            const projectId = localStorage.getItem('current_project_id') || '2';
            
            // 从数据库API获取币种信息
            const response = await fetch(`/get-currency-types.php?projectId=27`);
            
            if (response.ok) {
              const result = await response.json();
              data = result.data || [];
              success = true;
              console.log("成功获取币种列表:", data);
            } else {
              throw new Error(`API返回状态码: ${response.status}`);
            }
          } catch (retryError) {
            console.warn(`获取币种列表第${attempts}次尝试失败:`, retryError);
            if (attempts < maxAttempts) {
              // 增加等待时间
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            }
          }
        }
        
        if (success) {
          if (data.length > 0) {
            // 检查是否有新创建的币种在localStorage中
            const newCurrencies = JSON.parse(localStorage.getItem('newCurrencies') || '[]');
            if (newCurrencies.length > 0) {
              // 合并新币种到现有列表
              const allCurrencies = [...data, ...newCurrencies];
              setCurrencies(allCurrencies);
              console.log('合并新创建的币种:', allCurrencies);
            } else {
              setCurrencies(data);
            }
          } else {
            setCurrencies([]);
            toast({
              title: "数据获取提示",
              description: "未找到币种数据",
              variant: "default",
            });
          }
        } else {
          setCurrencies([]);
          toast({
            variant: "destructive",
            title: "连接失败",
            description: "无法连接到服务器获取币种数据，请稍后重试",
          });
        }
      } catch (error) {
        console.error("获取币种列表失败:", error);
        
        // 不使用默认值，显示空数据和错误提示
        setCurrencies([]);
        
        toast({
          variant: "destructive",
          title: "获取币种列表失败",
          description: "无法连接到服务器获取币种数据，请稍后重试",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrencies();
  }, [toast]);

  const handleAdd = () => {
    setEditingCurrency(null);
    setFormData({ name: "", code: "", description: "" });
    setIsDialogOpen(true);
  };

  const handleEdit = (currency: CurrencyType) => {
    setEditingCurrency(currency);
    setFormData({ 
      name: currency.name, 
      code: currency.code,
      description: currency.description || ""
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingCurrencyId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCurrencyId) return;
    
    try {
      setIsSubmitting(true);
      await deleteCurrencyType(deletingCurrencyId);
      setCurrencies(currencies.filter(c => c.id !== deletingCurrencyId));
      toast({
        description: "币种已删除",
      });
    } catch (error: any) {
      console.error("删除币种失败:", error);
      
      // 提取API返回的错误消息
      let errorMsg = "请稍后再试或联系管理员";
      if (error.response && error.response.data && error.response.data.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      toast({
        variant: "destructive",
        title: "删除币种失败",
        description: errorMsg,
      });
    } finally {
      setIsSubmitting(false);
      setIsDeleteDialogOpen(false);
      setDeletingCurrencyId(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.code) {
      toast({
        variant: "destructive",
        description: "币种名称和代码不能为空",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (editingCurrency) {
        // 更新币种
        const updated = await updateCurrencyType(editingCurrency.id, {
          name: formData.name,
          description: formData.description
        });
        
        setCurrencies(currencies.map(c => 
          c.id === editingCurrency.id ? updated : c
        ));
        
        toast({
          description: "币种已更新",
        });
      } else {
        // 创建币种 - 确保币种代码为大写
        const newCurrency = await createCurrencyType({
          name: formData.name,
          code: formData.code.toUpperCase(), // 强制转为大写
          description: formData.description
        });
        
        setCurrencies([...currencies, newCurrency]);
        
        toast({
          description: "新币种已添加",
        });
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("保存币种失败:", error);
      toast({
        variant: "destructive",
        title: "保存币种失败",
        description: error.message || "请稍后再试或联系管理员",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMobile = useIsMobile();

  // 无数据时显示的组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <FileQuestion className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无币种数据
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          添加币种以管理不同的货币类型
        </p>
      </div>
    </Card>
  );

  // 加载中显示
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-start mb-4">
        <Button onClick={handleAdd}><Plus className="mr-2" />添加币种</Button>
      </div>

      {currencies.length === 0 ? (
        <NoDataDisplay />
      ) : (
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="grid gap-4 p-4">
                {currencies.map((currency) => (
                  <Card key={currency.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{currency.name}</div>
                          <div className="text-sm text-muted-foreground">{currency.code}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(currency)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(currency.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                    <TableHead>币种名称</TableHead>
                    <TableHead>币种代码</TableHead>
                    <TableHead className="w-[100px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currencies.map((currency) => (
                    <TableRow key={currency.id} className="hover:bg-muted/50 cursor-pointer">
                      <TableCell>{currency.name}</TableCell>
                      <TableCell>{currency.code}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(currency)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(currency.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 编辑/添加对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCurrency ? "编辑币种" : "添加币种"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label>币种名称</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label>币种代码</label>
              <Input
                value={formData.code}
                disabled={!!editingCurrency}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="例如：USD, CNY, EUR"
              />
              {editingCurrency && (
                <p className="text-xs text-muted-foreground">币种代码一旦创建不可修改</p>
              )}
            </div>
            <div className="space-y-2">
              <label>币种描述</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDialogOpen(false)} variant="outline" disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                editingCurrency ? "更新" : "添加"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-2">确定要删除此币种吗？此操作无法撤销。</p>
              <p className="font-semibold text-destructive">注意：如果此币种有关联的账户，删除操作将失败。您必须先删除所有使用此币种的账户，然后才能删除币种。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CurrencyTypeManager;
