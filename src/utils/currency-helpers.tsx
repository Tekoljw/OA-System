import { Wallet } from "lucide-react";
import React from "react";
import { JSX } from "react";

type CurrencyIconProps = {
  currency: string;
};

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
  BCH: "BCH",
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

/**
 * 获取币种图标
 * @param currency 币种代码
 * @returns 返回对应的图标React元素
 */
export const getCurrencyIcon = (currency: string) => {
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