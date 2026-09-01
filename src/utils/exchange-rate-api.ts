/**
 * 汇率与本位币
 *
 * 汇率统一以 USD 为锚存储（rateToUsd = 1 单位该币种折合多少 USD），
 * 本位币只影响展示换算，不影响存储。
 */
import { apiRequest } from '../api/client';

export interface ExchangeRate {
  id: string;
  name: string;
  code: string;
  description?: string;
  /** 1 单位该币种 = 多少 USD；从未维护过为 null */
  rateToUsd: number | null;
  /** 打开后由公开报价自动刷新，关闭则必须手动维护 */
  autoFetch: boolean;
  /** 有效小时数，超期即失效 */
  validHours: number;
  rateUpdatedAt: string | null;
  rateSource: 'anchor' | 'manual' | 'auto' | null;
  isAnchor: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  /** 距失效剩余秒数（服务端计算，避免时区偏差）；已失效为 0，无汇率为 null */
  expiresInSeconds: number | null;
}

export interface RateSettingsUpdate {
  rateToUsd?: number;
  autoFetch?: boolean;
  validHours?: number;
}

export async function getExchangeRates(): Promise<ExchangeRate[]> {
  const result = await apiRequest('GET', '/api/exchange-rates');
  return result.data || [];
}

export async function updateExchangeRate(id: string, data: RateSettingsUpdate): Promise<ExchangeRate> {
  const result = await apiRequest('PUT', `/api/exchange-rates/${id}`, data);
  return result.data;
}

export async function refreshExchangeRates(): Promise<{ updated: string[]; failed: Record<string, string> }> {
  const result = await apiRequest('POST', '/api/exchange-rates/refresh', {});
  return result.data;
}

export async function getBaseCurrency(): Promise<string> {
  const result = await apiRequest('GET', '/api/base-currency');
  return result.data?.baseCurrency || 'USD';
}

export async function setBaseCurrency(code: string): Promise<string> {
  const result = await apiRequest('PUT', '/api/base-currency', { baseCurrency: code });
  return result.data?.baseCurrency || code;
}
