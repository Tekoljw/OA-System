/**
 * 格式化工具
 * 处理货币、数字、日期等格式化
 */

/**
 * 货币格式化
 * @param amount 金额
 * @param currency 货币代码 (例如: CNY, USD)
 * @returns 格式化后的货币字符串
 */
export function formatCurrency(amount: number, currency: string = 'CNY'): string {
  // 设置默认货币符号和格式
  let symbol = '¥';
  let locale = 'zh-CN';
  
  // 根据货币代码设置不同的符号和格式
  switch (currency) {
    case 'USD':
      symbol = '$';
      locale = 'en-US';
      break;
    case 'EUR':
      symbol = '€';
      locale = 'de-DE';
      break;
    case 'GBP':
      symbol = '£';
      locale = 'en-GB';
      break;
    case 'JPY':
      symbol = '¥';
      locale = 'ja-JP';
      break;
    default:
      // 默认为人民币
      symbol = '¥';
      locale = 'zh-CN';
  }
  
  // 使用Intl格式化数字
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  
  return formatter.format(amount);
}

/**
 * 格式化百分比
 * @param value 百分比值 (例如: 0.15 表示 15%)
 * @param decimals 小数位数
 * @returns 格式化后的百分比字符串
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * 格式化日期
 * @param date 日期对象或日期字符串
 * @param format 格式 ('short', 'medium', 'long')
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date | string, format: 'short' | 'medium' | 'long' = 'medium'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  let options: Intl.DateTimeFormatOptions = {};
  
  switch (format) {
    case 'short':
      options = { year: 'numeric', month: '2-digit', day: '2-digit' };
      break;
    case 'long':
      options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
      };
      break;
    default: // medium
      options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
      };
  }
  
  return new Intl.DateTimeFormat('zh-CN', options).format(dateObj);
}

/**
 * 格式化大数字 (千分位分隔)
 * @param num 数字
 * @returns 格式化后的数字字符串
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num);
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}