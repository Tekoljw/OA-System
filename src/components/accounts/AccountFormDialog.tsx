
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
        // 币种与账户类型都必须来自服务端，不做假数据兜底。
        //
        // 原先这里在「接口失败」和「返回空」两种情况下都塞进一套写死的默认值
        // （人民币/美元/欧元/日元/英镑、运营账户/资本账户/外汇账户/投资账户），
        // id 固定为 1~5。这些在库里根本不存在 —— 用户照着选并提交，服务端拿到
        // 一个对不上的 id，要么建错要么报一句看不懂的错；而接口其实早就挂了，
        // 界面上却一切正常，问题被这套假数据完全盖住。
        // 现在失败就是空列表，下拉里会明确提示「请先到配置管理添加」。
        let currencies: CurrencyType[] = [];
        let types: AccountType[] = [];

        try {
          currencies = (await getCurrencyTypes()) || [];
        } catch (error) {
          console.error("AccountFormDialog - 币种数据加载失败:", error);
          currencies = [];
        }

        try {
          types = (await getAccountTypes()) || [];
        } catch (error) {
          console.error("AccountFormDialog - 账户类型数据加载失败:", error);
          types = [];
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
