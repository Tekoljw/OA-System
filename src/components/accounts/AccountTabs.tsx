
import React, { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import AccountGrid from "./AccountGrid";
import { 
  Wallet, Network, AreaChart, Briefcase, Loader2,
  DollarSign, CircleDollarSign, PiggyBank, Building, Landmark, Wallet2,
  BadgeDollarSign, Banknote, Store, CircleEllipsis, Bitcoin
} from "lucide-react";
import { getCurrencyTypes, getAccountTypes } from "@/utils/config-api";

// 定义已知币种符号表
const CURRENCY_SYMBOLS: Record<string, string> = {
  // 常见法定货币
  CNY: "¥",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  HKD: "HK$",
  NZD: "NZ$",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  RUB: "₽",
  INR: "₹",
  MYR: "RM",
  THB: "฿",
  IDR: "Rp",
  PHP: "₱",
  MXN: "Mex$",
  BRL: "R$",
  ZAR: "R",
  
  // 加密货币
  BTC: "₿",
  ETH: "Ξ",
  USDT: "₮",
  XRP: "XRP",
  LTC: "Ł",
  DOT: "DOT",
  DOGE: "Ð",
  ADA: "₳",
  SOL: "SOL",
};

// 定义币种颜色表
const CURRENCY_COLORS: Record<string, string> = {
  // 常见法定货币
  CNY: "text-green-600",
  USD: "text-blue-600",
  EUR: "text-yellow-600",
  JPY: "text-red-600",
  GBP: "text-indigo-600",
  AUD: "text-green-700",
  CAD: "text-red-700",
  SGD: "text-purple-600",
  HKD: "text-red-500",
  
  // 加密货币
  BTC: "text-orange-500",
  ETH: "text-purple-500",
  XRP: "text-blue-400",
  LTC: "text-gray-500",
};

// 获取默认颜色
const getDefaultColor = (code: string): string => {
  // 根据币种代码的首字母选择不同的默认颜色
  const firstChar = code.charAt(0).toLowerCase();
  
  if ('abcd'.includes(firstChar)) return 'text-blue-500';
  if ('efgh'.includes(firstChar)) return 'text-green-500';
  if ('ijkl'.includes(firstChar)) return 'text-yellow-500';
  if ('mnop'.includes(firstChar)) return 'text-red-500';
  if ('qrst'.includes(firstChar)) return 'text-purple-500';
  if ('uvwxyz'.includes(firstChar)) return 'text-orange-500';
  
  return 'text-gray-500';
};

// 币种图标映射
const getCurrencyIcon = (currency: string) => {
  if (currency === "全部" || currency === "ALL") {
    return <Wallet className="h-4 w-4 mr-1.5" />;
  }
  
  const code = currency.toUpperCase(); // 统一使用大写
  
  // 获取币种符号，如果没有定义则使用首字母
  const symbol = CURRENCY_SYMBOLS[code] || code.substring(0, 1) + "$";
  
  // 获取币种颜色，如果没有定义则使用默认颜色
  const color = CURRENCY_COLORS[code] || getDefaultColor(code);
  
  return <span className={`mr-1.5 ${color}`}>{symbol}</span>;
};

// 定义账户类型图标映射
const ACCOUNT_TYPE_ICONS: Record<string, React.ReactNode> = {
  "运营账户": <Briefcase className="h-4 w-4 mr-1.5" />,
  "资本账户": <AreaChart className="h-4 w-4 mr-1.5" />,
  "外汇账户": <Network className="h-4 w-4 mr-1.5" />,
  "投资账户": <AreaChart className="h-4 w-4 mr-1.5" />,
  "现金账户": <Wallet className="h-4 w-4 mr-1.5" />,
  "全部": <Wallet className="h-4 w-4 mr-1.5" />,
  "ALL": <Wallet className="h-4 w-4 mr-1.5" />,
};

// 定义默认图标颜色映射

// 按账户类型名称的特征词自动推断图标
const getAccountTypeIcon = (typeName: string): React.ReactNode => {
  const lowerName = typeName.toLowerCase();
  
  // 已有明确定义的类型直接返回
  if (ACCOUNT_TYPE_ICONS[typeName]) {
    return ACCOUNT_TYPE_ICONS[typeName];
  }
  
  // 根据账户类型名称特征词匹配合适的图标
  if (lowerName.includes("现金") || lowerName.includes("cash")) {
    return <Banknote className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("储蓄") || lowerName.includes("saving")) {
    return <PiggyBank className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("投资") || lowerName.includes("invest")) {
    return <CircleDollarSign className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("贷款") || lowerName.includes("loan")) {
    return <BadgeDollarSign className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("银行") || lowerName.includes("bank")) {
    return <Building className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("加密") || lowerName.includes("crypto")) {
    return <Bitcoin className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("零售") || lowerName.includes("retail")) {
    return <Store className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("金融") || lowerName.includes("finance")) {
    return <Landmark className="h-4 w-4 mr-1.5" />;
  }
  if (lowerName.includes("钱包") || lowerName.includes("wallet")) {
    return <Wallet2 className="h-4 w-4 mr-1.5" />;
  }
  
  // 默认使用美元符号图标
  return <DollarSign className="h-4 w-4 mr-1.5" />;
};

// 账户类型图标映射函数
const getTypeIcon = (type: string) => {
  return getAccountTypeIcon(type);
};

const AccountTabs = () => {
  // 初始只放「全部」，其余等 API 返回。
  // 原先这里写死了默认列表（"运营账户/资本账户/外汇账户/投资账户"），
  // 而库里的账户类型是「活期账户/定期账户/信用卡/投资账户」—— 首屏会闪一下
  // 假类型，接口一旦失败（catch 里只 console.error）就一直显示这些并不存在的
  // 类型，用户按它筛选永远筛不出东西，还看不出是接口挂了。
  const [currencies, setCurrencies] = useState<string[]>(["全部"]);
  const [types, setTypes] = useState<string[]>(["全部"]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // 获取币种列表
        const currencyTypes = await getCurrencyTypes();
        if (currencyTypes && currencyTypes.length > 0) {
          // 从API结果中提取币种代码，并在开头添加"全部"
          const currencyCodes = ["全部", ...currencyTypes.map(c => c.code)];
          setCurrencies(currencyCodes);
        }
        
        // 获取账户类型列表
        const accountTypes = await getAccountTypes();
        if (accountTypes && accountTypes.length > 0) {
          // 从API结果中提取账户类型名称，并在开头添加"全部"
          const typeNames = ["全部", ...accountTypes.map(t => t.name)];
          setTypes(typeNames);
        }
      } catch (error) {
        console.error("获取账户管理数据失败:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // 如果正在加载，显示加载指示器
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">加载账户数据...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="全部" className="w-full">
        <div className="mb-8">
          {/* 使用自动换行的TabsList，优化布局 */}
          <div className="mb-2 w-full">
            <div className="mb-1">
              <TabsList className="flex flex-wrap h-auto rounded-md bg-muted p-1 w-full justify-start">
                {currencies.map((currency, index) => (
                  <TabsTrigger 
                    key={`currency-trigger-${currency}-${index}`} 
                    value={currency} 
                    className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                  >
                    {getCurrencyIcon(currency)}
                    {currency}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {/* 下边框 */}
            <div className="h-[1px] bg-border w-full"></div>
          </div>
        </div>

        {currencies.map((currency, currencyIndex) => (
          <TabsContent key={`currency-content-${currency}-${currencyIndex}`} value={currency}>
            <Tabs defaultValue="全部">
              <div className="mb-8">
                {/* 账户类型优化网格布局 */}
                <div className="mb-2 w-full">
                  <div className="mb-1">
                    <TabsList className="flex flex-wrap h-auto rounded-md bg-muted p-1 w-full justify-start">
                      {types.map((type, typeIndex) => (
                        <TabsTrigger 
                          key={`account-type-trigger-${type}-${typeIndex}`} 
                          value={type} 
                          className="flex items-center justify-start h-8 px-3 text-sm whitespace-nowrap m-1"
                        >
                          {getTypeIcon(type)}
                          {type}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  {/* 下边框 */}
                  <div className="h-[1px] bg-border w-full"></div>
                </div>
              </div>

              {types.map((type) => (
                <TabsContent key={type} value={type}>
                  <AccountGrid 
                    currency={currency === "全部" ? "ALL" : currency} 
                    type={type === "全部" ? "ALL" : type} 
                  />
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default AccountTabs;
