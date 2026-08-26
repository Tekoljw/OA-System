/**
 * 币种服务 - 提供币种数据和转换功能
 * 
 * 该服务确保币种数据在前端始终可用，即使API不可访问
 */

// 默认币种数据 - 仅在API完全失败时使用
export const DEFAULT_CURRENCIES = [
  { id: "56", code: "CNY", name: "人民币", symbol: "¥", exchangeRate: 1.0, description: "中国法定货币" },
  { id: "57", code: "USD", name: "美元", symbol: "$", exchangeRate: 7.2, description: "美国法定货币" },
  { id: "58", code: "EUR", name: "欧元", symbol: "€", exchangeRate: 7.8, description: "欧盟法定货币" },
  { id: "59", code: "JPY", name: "日元", symbol: "¥", exchangeRate: 0.05, description: "日本法定货币" },
  { id: "60", code: "GBP", name: "英镑", symbol: "£", exchangeRate: 9.0, description: "英国法定货币" },
  { id: "61", code: "HKD", name: "港币", symbol: "HK$", exchangeRate: 0.9, description: "香港特别行政区法定货币" }
];

// 获取默认币种
export function getDefaultCurrency() {
  return DEFAULT_CURRENCIES[0]; // CNY
}

// 获取外币币种
export function getForexCurrency() {
  return DEFAULT_CURRENCIES[1]; // USD
}

// 格式化货币
export function formatCurrency(amount: number, currencyCode: string = 'CNY'): string {
  // 如果金额为undefined或null，返回0
  if (amount === undefined || amount === null) {
    amount = 0;
  }

  // 查找币种信息
  const currency = DEFAULT_CURRENCIES.find(c => c.code === currencyCode) || getDefaultCurrency();
  
  // 格式化数字，保留2位小数
  return `${currency.symbol}${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// 获取币种
export async function getCurrencies() {
  try {
    // 最多尝试3次
    for (let i = 0; i < 3; i++) {
      try {
        const projectId = localStorage.getItem('current_project_id') || '2';
        const timestamp = Date.now();
        
        const response = await fetch(`/api/currency-types?projectId=${projectId}&_t=${timestamp}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache, no-store'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          const data = result.data || [];
          
          if (data.length > 0) {
            console.log('币种服务: 成功获取币种数据', data);
            return data;
          }
        }
        
        // 请求成功但没有数据，等待一下再重试
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      } catch (error) {
        console.warn(`币种服务: 第${i+1}次获取币种数据失败`, error);
        
        // 最后一次尝试失败后，不等待
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        }
      }
    }
    
    // 所有尝试都失败，返回默认值
    console.warn('币种服务: 所有获取币种数据的尝试都失败，使用默认值');
    return DEFAULT_CURRENCIES;
  } catch (error) {
    console.error('币种服务: 获取币种数据出错', error);
    return DEFAULT_CURRENCIES;
  }
}

// 获取特定币种信息
export async function getCurrencyByCode(code: string) {
  try {
    const currencies = await getCurrencies();
    return currencies.find(c => c.code === code) || 
           DEFAULT_CURRENCIES.find(c => c.code === code) ||
           getDefaultCurrency();
  } catch (error) {
    console.error(`币种服务: 获取币种(${code})信息出错`, error);
    return DEFAULT_CURRENCIES.find(c => c.code === code) || getDefaultCurrency();
  }
}

// 获取货币符号
export function getCurrencySymbol(code: string): string {
  const currency = DEFAULT_CURRENCIES.find(c => c.code === code);
  return currency ? currency.symbol : '¥'; // 默认使用人民币符号
}

// 获取当前项目ID
export function getCurrentProjectId(): number {
  if (typeof localStorage === 'undefined') return 2;
  
  const projectIdStr = localStorage.getItem('current_project_id');
  if (projectIdStr && !isNaN(parseInt(projectIdStr))) {
    return parseInt(projectIdStr);
  }
  
  return 2; // 默认使用演示项目ID
}