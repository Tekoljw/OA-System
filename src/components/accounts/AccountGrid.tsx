import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Switch } from "../ui/switch";
import { Check, X, Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import AccountFormDialog from "./AccountFormDialog";
import LoadingState from "../common/LoadingState";
import ErrorState from "../common/ErrorState";
import EmptyState from "../common/EmptyState";
import { useTranslation } from "react-i18next";
import { 
  Account, 
  getAccounts, 
  createAccount, 
  updateAccount, 
  deleteAccount 
} from "../../utils/config-api";
import { useToast } from "../../hooks/use-toast";
import { usePermissions } from "../../hooks/use-permissions";

// 使用从config-api导入的Account接口
// 定义自己的LocalAccount接口，与API接口兼容
interface LocalAccount {
  id: string;
  name: string;
  accountNumber: string;
  bank?: string;
  balance: number;
  limit: number;
  isVerified: boolean;
  currencyType: string;
  accountType: string;
}

interface AccountGridProps {
  currency: string;
  type: string;
}

// 格式化数字为带千位分隔符的字符串
const formatNumber = (num: number | undefined | null) => {
  // 如果值为undefined或null，默认为0
  const safeNum = num === undefined || num === null ? 0 : num;
  return safeNum.toLocaleString('zh-CN', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  });
};

// 获取货币符号
const getCurrencySymbol = (currency: string | undefined | null) => {
  // 如果货币为undefined或null，默认为CNY
  const safeCurrency = currency || 'CNY';
  switch (safeCurrency) {
    case "CNY":
      return "¥";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "JPY":
      return "¥";
    default:
      return safeCurrency;
  }
};

const AccountGrid: React.FC<AccountGridProps> = ({ currency, type }) => {
  // 账户的新增/编辑/删除只有会计能做，其他角色只读
  const { can } = usePermissions();
  const canManageAccounts = can('manage_accounting');
  const { t } = useTranslation();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]); // 使用string类型的ID
  const [activeAccounts, setActiveAccounts] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LocalAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  
  // 使用API加载账户
  useEffect(() => {
    const fetchAccounts = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 调用API获取账户数据
        const accountsData = await getAccounts(currency, type);
        
        // 确保每个账户都有余额和验证状态（后端可能不返回这些字段）
        const processedAccounts: LocalAccount[] = accountsData.map(account => ({
          id: String(account.id), // 确保id是字符串
          name: account.name,
          accountNumber: account.accountNumber,
          bank: account.bank || '',
          balance: account.balance || 0,
          limit: account.limit,
          isVerified: account.isVerified ?? true,
          currencyType: account.currencyType,
          accountType: account.accountType
        }));
        
        // 初始化激活状态（默认所有验证过的账户都是激活的）
        const initialActiveAccounts = processedAccounts
          .filter(account => account.isVerified)
          .map(account => account.id);
        setActiveAccounts(initialActiveAccounts);
        
        // 按照超出限额（红色）账户排在最前面，停用（未验证）账户排在最后面的顺序排序
        processedAccounts.sort((a, b) => {
          const aOverLimit = a.balance > a.limit;
          const bOverLimit = b.balance > b.limit;
          
          if (aOverLimit && !bOverLimit) return -1; // a超出限额，b没有，a排前面
          if (!aOverLimit && bOverLimit) return 1;  // b超出限额，a没有，b排前面
          
          // 都超出限额或都没超出限额，按验证状态排序
          if (a.isVerified && !b.isVerified) return -1; // a已验证，b未验证，a排前面
          if (!a.isVerified && b.isVerified) return 1;  // b已验证，a未验证，b排前面
          
          // 验证状态相同，按ID排序（使用字符串比较）
          return a.id.localeCompare(b.id);
        });
        
        setAccounts(processedAccounts);
        setLoading(false);
      } catch (err) {
        console.error('获取账户列表失败:', err);
        
        // 显示错误信息，让用户知道连接问题
        setError(typeof err === 'string' ? err : '获取账户列表失败，请检查网络连接后重试');
        setLoading(false);
        setAccounts([]);
        
        toast({
          title: "连接失败",
          description: "无法连接到服务器，请稍后重试",
          variant: "destructive"
        });
      }
    };
    
    fetchAccounts();
  }, [currency, type]);

  const isOverLimit = (balance: number | undefined | null, limit: number | undefined | null) => {
    // 如果balance或limit为undefined或null，提供默认值
    const safeBalance = balance === undefined || balance === null ? 0 : balance;
    const safeLimit = limit === undefined || limit === null ? 0 : limit;
    return safeBalance > safeLimit;
  };

  const handleCheckboxChange = (accountId: string) => {
    setSelectedAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  // 移除卡片点击选择账户功能
  // 用户现在只能通过勾选框选择账户

  const handleBatchDelete = async () => {
    try {
      // 检查所有选中账户是否有非零余额
      const accountsWithBalance = accounts.filter(account => 
        selectedAccounts.includes(account.id) && account.balance > 0
      );
      
      if (accountsWithBalance.length > 0) {
        // 如果有账户有余额，显示错误消息并列出这些账户
        const accountNames = accountsWithBalance.map(acc => acc.name).join(', ');
        toast({
          title: "删除失败",
          description: `以下账户余额不为零，无法删除: ${accountNames}`,
          variant: "destructive",
        });
        setDeleteDialogOpen(false);
        return;
      }
      
      // 逐个删除选中的账户
      const failedAccounts = [];
      for (const id of selectedAccounts) {
        try {
          await deleteAccount(id);
        } catch (err) {
          // 记录删除失败的账户
          const failedAccount = accounts.find(acc => acc.id === id);
          if (failedAccount) {
            failedAccounts.push(failedAccount.name);
          }
        }
      }
      
      if (failedAccounts.length === 0) {
        toast({
          title: "删除成功",
          description: `成功删除${selectedAccounts.length}个账户`,
        });
        
        // 刷新账户列表
        setAccounts(prev => prev.filter(account => !selectedAccounts.includes(String(account.id))));
      } else if (failedAccounts.length < selectedAccounts.length) {
        // 部分成功，部分失败
        toast({
          title: "部分删除成功",
          description: `以下账户删除失败: ${failedAccounts.join(', ')}`,
          variant: "default",
        });
        
        // 刷新账户列表，仅保留删除失败的账户
        setAccounts(prev => prev.filter(account => 
          !selectedAccounts.includes(String(account.id)) || 
          failedAccounts.includes(account.name)
        ));
      } else {
        // 全部删除失败
        toast({
          title: "删除失败",
          description: "所有选中的账户都无法删除",
          variant: "destructive",
        });
      }
      
      setDeleteDialogOpen(false);
      setSelectedAccounts([]);
    } catch (error) {
      console.error("批量删除账户失败:", error);
      toast({
        title: "删除失败",
        description: typeof error === 'string' ? error : "删除账户时发生错误，请重试",
        variant: "destructive",
      });
    }
  };
  
  const handleSingleDelete = async () => {
    if (deletingAccount) {
      try {
        await deleteAccount(deletingAccount);
        
        toast({
          title: "删除成功",
          description: "账户已成功删除",
        });
        
        // 从列表中移除已删除的账户
        setAccounts(prev => prev.filter(account => String(account.id) !== deletingAccount));
        setSelectedAccounts(prev => prev.filter(id => id !== deletingAccount));
      } catch (error) {
        console.error("删除账户失败:", error);
        toast({
          title: "删除失败",
          description: typeof error === 'string' ? error : "删除账户时发生错误，请重试",
          variant: "destructive",
        });
      }
    }
    setDeletingAccount(null);
  };

  const handleFormSubmit = async (data: any) => {
    try {
      let result;
      
      // 确保所有必填字段都有值
      if (!data.bank || data.bank.trim() === "") {
        toast({
          title: "保存失败",
          description: "银行名称不能为空",
          variant: "destructive",
        });
        return;
      }
      
      if (editingAccount) {
        // 更新现有账户
        result = await updateAccount(String(editingAccount.id), {
          name: data.name,
          accountNumber: data.accountNumber,
          bank: data.bank,
          limit: parseFloat(data.limit),
          currencyType: data.currency,
          accountType: data.type
        });
        
        // 更新本地账户列表
        setAccounts(prev => prev.map(account => 
          String(account.id) === String(editingAccount.id) ? { ...account, ...result } : account
        ));
        
        toast({
          title: "更新成功",
          description: `账户 ${data.name} 已更新`,
        });
      } else {
        // 创建新账户
        const accountData = {
          name: data.name,
          accountNumber: data.accountNumber,
          bank: data.bank,
          limit: parseFloat(data.limit),
          currencyType: data.currency,
          accountType: data.type
        };
        
        console.log("创建账户数据:", accountData);
        
        result = await createAccount(accountData);
        
        // 添加新账户到列表
        setAccounts(prev => [...prev, { ...result, balance: 0, isVerified: true }]);
        
        toast({
          title: "创建成功",
          description: `账户 ${data.name} 已创建`,
        });
      }
      
      // 关闭表单
      setFormDialogOpen(false);
      setEditingAccount(null);
    } catch (error: any) {
      console.error("保存账户失败:", error);
      
      // 提供更具体的错误信息
      let errorMessage = "保存账户时发生错误，请重试";
      
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.message) {
        if (error.message.includes("缺少必填字段")) {
          errorMessage = "请填写所有必填字段，包括银行名称";
        } else if (error.message.includes("已存在")) {
          errorMessage = "账户名称或账号已存在，请使用其他名称";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "保存失败",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };
  
  const handleAccountActiveToggle = (accountId: string, checked: boolean) => {
    if (checked) {
      setActiveAccounts(prev => [...prev, accountId]);
      console.log(`账户 ${accountId} 已启用`);
    } else {
      setActiveAccounts(prev => prev.filter(id => id !== accountId));
      console.log(`账户 ${accountId} 已冻结`);
    }
  };

  // 如果正在加载，显示加载状态
  if (loading) {
    return <LoadingState title={t('accounts.loading') || '加载账户信息中...'} />;
  }
  
  // 如果发生错误，显示错误状态
  if (error) {
    return (
      <ErrorState 
        error={error} 
        onRetry={() => {
          setLoading(true);
          setError(null);
          // 重新加载数据的逻辑
        }} 
      />
    );
  }
  
  // 如果没有账户数据，显示空状态
  if (accounts.length === 0) {
    return (
      <>
        <EmptyState 
          title={t('accounts.noAccounts') || '暂无账户信息'} 
          actionText={t('accounts.addAccount') || '添加账户'}
          onAction={() => {
            console.log("EmptyState按钮点击 - 设置formDialogOpen为true");
            setFormDialogOpen(true);
          }}
        />
        
        <AccountFormDialog
          isOpen={formDialogOpen}
          onClose={() => {
            console.log("AccountFormDialog关闭");
            setFormDialogOpen(false);
            setEditingAccount(null);
          }}
          onSubmit={handleFormSubmit}
          title="添加账户"
          initialData={undefined}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex justify-start gap-2 mb-4">
        <Button
          onClick={() => setFormDialogOpen(true)}
          disabled={!canManageAccounts}
          title={canManageAccounts ? undefined : '只有会计可以新增账户'}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('accounts.addAccount') || '添加账户'}
        </Button>
        <Button 
          variant="destructive" 
          onClick={() => {
            setDeletingAccount(null);
            setDeleteDialogOpen(true);
          }}
          disabled={selectedAccounts.length === 0 || !canManageAccounts}
          title={canManageAccounts ? undefined : '只有会计可以删除账户'}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t('accounts.deleteAccount') || '删除账户'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-items-center">
        {accounts.map((account) => {
          const overLimit = isOverLimit(account.balance, account.limit);
          
          return (
            <Card 
              key={account.id} 
              className={cn(
                "hover:shadow-lg transition-shadow relative min-w-[250px] w-full max-w-[350px] cursor-pointer",
                overLimit ? "border-destructive border-2" : "",
                selectedAccounts.includes(account.id) ? "ring-2 ring-primary" : ""
              )}
              onClick={() => handleCheckboxChange(account.id)}
            >
              <CardHeader className="pb-1 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-md font-semibold">{account.name}</CardTitle>
                  <div className="flex items-center">
                    {account.isVerified ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-1 pb-2">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    {account.bank}
                  </div>
                  <div className="font-mono text-sm">
                    {account.accountNumber}
                  </div>
                  <div className={cn(
                    "text-xl font-medium font-mono tracking-tighter whitespace-nowrap overflow-hidden text-ellipsis",
                    overLimit ? "text-destructive" : ""
                  )}>
                    {getCurrencySymbol(account.currencyType)} {formatNumber(account.balance)}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono tracking-tighter whitespace-nowrap overflow-hidden text-ellipsis">
                    额度: {getCurrencySymbol(account.currencyType)} {formatNumber(account.limit)}
                  </div>
                  
                  {/* 操作区域移到下方并左对齐，增大按钮间距 */}
                  <div className="flex items-center justify-between w-full pt-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`switch-${account.id}`}
                        checked={activeAccounts.includes(account.id)}
                        onCheckedChange={(checked) => handleAccountActiveToggle(account.id, checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={activeAccounts.includes(account.id) ? "冻结账户" : "激活账户"}
                      />
                      <span className="text-xs text-muted-foreground">
                        {activeAccounts.includes(account.id) ? "开启" : "冻结"}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          // 编辑账户时，确保准备好适合表单的格式
                          setEditingAccount({
                            ...account,
                            // 确保数字类型字段正确处理
                            limit: account.limit,
                            balance: account.balance
                          });
                          setFormDialogOpen(true);
                        }}
                        aria-label="编辑账户"
                        disabled={!canManageAccounts}
                        title={canManageAccounts ? '编辑账户' : '只有会计可以编辑账户'}
                      >
                        <Edit className="h-5 w-5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-9 w-9 p-0 text-red-500 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingAccount(account.id);
                          setDeleteDialogOpen(true);
                        }}
                        aria-label="删除账户"
                        disabled={!canManageAccounts}
                        title={canManageAccounts ? '删除账户' : '只有会计可以删除账户'}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingAccount 
                ? (() => {
                    // 查找被删除的账户并检查余额
                    const accountToDelete = accounts.find(acc => acc.id === deletingAccount);
                    if (accountToDelete && accountToDelete.balance > 0) {
                      return (
                        <div className="text-destructive font-medium">
                          此账户余额不为零，无法删除。请先将余额清零后再删除账户。
                        </div>
                      );
                    }
                    return "您确定要删除此账户吗？此操作不可撤销。";
                  })()
                : `您确定要删除选中的 ${selectedAccounts.length} 个账户吗？此操作不可撤销。`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            {deletingAccount ? (
              (() => {
                // 查找被删除的账户并检查余额
                const accountToDelete = accounts.find(acc => acc.id === deletingAccount);
                if (accountToDelete && accountToDelete.balance > 0) {
                  return (
                    <Button variant="secondary" disabled>
                      账户有余额，无法删除
                    </Button>
                  );
                }
                return (
                  <AlertDialogAction onClick={handleSingleDelete}>
                    确认删除
                  </AlertDialogAction>
                );
              })()
            ) : (
              // 批量删除暂不检查余额，后端会处理
              <AlertDialogAction onClick={handleBatchDelete}>
                确认删除
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AccountFormDialog
        isOpen={formDialogOpen}
        onClose={() => {
          setFormDialogOpen(false);
          setEditingAccount(null);
        }}
        onSubmit={handleFormSubmit}
        title={editingAccount ? "编辑账户" : "添加账户"}
        initialData={editingAccount ? {
          currency: editingAccount.currencyType || currency,
          type: editingAccount.accountType || type,
          name: editingAccount.name,
          accountNumber: editingAccount.accountNumber,
          bank: editingAccount.bank || "",
          limit: editingAccount.limit.toString(),
        } : undefined}
      />
    </>
  );
};

export default AccountGrid;
