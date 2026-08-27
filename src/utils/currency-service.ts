/**
 * 币种服务 - 提供币种数据和格式化功能
 */

import { apiRequest, getCurrentProjectId } from '../api/client';

// 币种符号映射（纯显示用，不含业务数据）
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', JPY: '¥', GBP: '£', HKD: 'HK$',
};

// 格式化货币
export function formatCurrency(amount: number, currencyCode: string = 'CNY'): string {
  if (amount === undefined || amount === null) amount = 0;
  const symbol = CURRENCY_SYMBOLS[currencyCode] || '¥';
  return `${symbol}${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// 获取币种列表（从API）
export async function getCurrencies() {
  const result = await apiRequest('GET', '/api/currency-types');
  return result.data || [];
}

// 获取特定币种信息
export async function getCurrencyByCode(code: string) {
  const currencies = await getCurrencies();
  return currencies.find((c: any) => c.code === code) || null;
}

// 获取货币符号
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || '¥';
}

// 获取当前项目ID
export { getCurrentProjectId };
