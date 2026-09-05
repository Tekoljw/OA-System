
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { getCurrencyTypes, getAccountTypes, CurrencyType, AccountType } from "../../utils/config-api";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  currency: z.string().min(1, "请选择币种"),
  type: z.string().min(1, "请选择账户类型"),
  name: z.string().min(1, "账户名不能为空"),
  accountNumber: z.string().min(1, "账户号不能为空"),
  bank: z.string().min(1, "银行名称不能为空"),
  limit: z.string().min(1, "风控额度不能为空"),
});

interface AccountFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: z.infer<typeof formSchema>) => void;
  title: string;
  initialData?: z.infer<typeof formSchema>;
}

const AccountFormDialog: React.FC<AccountFormDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  initialData,
}) => {
  const [currencyTypes, setCurrencyTypes] = useState<CurrencyType[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 表单初始化
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      currency: "",
      type: "",
      name: "",
      accountNumber: "",
      bank: "",
      limit: "",
    },
  });

  // 加载币种和账户类型数据
  useEffect(() => {
    const fetchConfigData = async () => {
      setIsLoading(true);
      try {
        // 分别获取币种和账户类型数据，如果一个失败不影响另一个
        let currencies: CurrencyType[] = [];
        let types: AccountType[] = [];
        
        try {
          currencies = await getCurrencyTypes();
          console.log("AccountFormDialog - 币种数据加载成功:", currencies);
          
          // 如果获取到的数据为空或无效，使用默认币种
          if (!currencies || currencies.length === 0) {
            console.log("AccountFormDialog - API返回空数据，使用默认币种");
            currencies = [
              { id: "1", name: "人民币", code: "CNY", description: "中国法定货币" },
              { id: "2", name: "美元", code: "USD", description: "美国法定货币" },
              { id: "3", name: "欧元", code: "EUR", description: "欧盟法定货币" },
              { id: "4", name: "日元", code: "JPY", description: "日本法定货币" },
              { id: "5", name: "英镑", code: "GBP", description: "英国法定货币" }
            ];
          }
        } catch (error) {
          console.error("AccountFormDialog - 币种数据加载失败:", error);
          // 如果币种加载失败，使用默认币种
          currencies = [
            { id: "1", name: "人民币", code: "CNY", description: "中国法定货币" },
            { id: "2", name: "美元", code: "USD", description: "美国法定货币" },
            { id: "3", name: "欧元", code: "EUR", description: "欧盟法定货币" },
            { id: "4", name: "日元", code: "JPY", description: "日本法定货币" },
            { id: "5", name: "英镑", code: "GBP", description: "英国法定货币" }
          ];
        }
        
        try {
          types = await getAccountTypes();
          console.log("AccountFormDialog - 账户类型数据加载成功:", types);
        } catch (error) {
          console.error("AccountFormDialog - 账户类型数据加载失败:", error);
          // 如果账户类型加载失败，使用默认账户类型
          types = [
            { id: "1", name: "运营账户", description: "用于日常经营活动的资金账户" },
            { id: "2", name: "资本账户", description: "用于股本和长期投资的资金账户" },
            { id: "3", name: "外汇账户", description: "用于外币交易和汇率管理的账户" },
            { id: "4", name: "投资账户", description: "用于证券、基金等投资活动的账户" }
          ];
        }
        
        setCurrencyTypes(currencies);
        setAccountTypes(types);
      } catch (error) {
        console.error("加载配置数据失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchConfigData();
      
      // 如果是编辑模式，重置表单值以确保选择控件正确显示值
      if (initialData) {
        form.reset(initialData);
        console.log("重置表单为初始值:", initialData);
      }
    }
  }, [isOpen, initialData, form]);

  // 当提交表单时
  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    onSubmit(data);
    form.reset();
    onClose();
  };
  
  // 当对话框关闭时
  const handleClose = () => {
    form.reset(); // 重置表单
    onClose();    // 调用父组件关闭方法
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            <span className="text-muted-foreground">加载配置数据...</span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>币种</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择币种" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencyTypes.length === 0 ? (
                          <div className="px-2 py-3 text-sm text-muted-foreground">
                            该项目还没有币种，请先到「配置管理 → 账户配置」添加
                          </div>
                        ) : currencyTypes.map((currency) => (
                          <SelectItem key={currency.id} value={currency.code}>
                            {currency.name} ({currency.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账户类型</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择账户类型" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {/* 选项为空时必须给出提示：Radix 的空 SelectContent 会展开成一条
                            空白窄条并盖住整个弹窗，点不到「确定」「取消」，
                            用户只能按 Esc 才能脱身，看起来像界面卡死 */}
                        {accountTypes.length === 0 ? (
                          <div className="px-2 py-3 text-sm text-muted-foreground">
                            该项目还没有账户类型，请先到「配置管理 → 账户配置」添加
                          </div>
                        ) : accountTypes.map((type) => (
                          // 提交 code 而非显示名：库中 account_type 存的是 current/fixed 等 code
                          <SelectItem key={type.id} value={type.code || type.name}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账户名</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="请输入账户名" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账户号</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="请输入账户号" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>银行名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="请输入银行名称" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>风控额度</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" placeholder="请输入风控额度" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  取消
                </Button>
                <Button type="submit">确定</Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AccountFormDialog;
