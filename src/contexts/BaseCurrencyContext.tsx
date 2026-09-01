import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ExchangeRate, getExchangeRates, getBaseCurrency, setBaseCurrency } from "../utils/exchange-rate-api";
import { useAuth } from "./AuthContext";

/**
 * 展示本位币。
 *
 * 默认 USD；用户切换后写入服务端（users.base_currency），
 * 换机器、换浏览器登录同一账号仍沿用上次选择。
 * localStorage 只作为首屏渲染前的缓存，服务端返回后即以服务端为准。
 */
interface BaseCurrencyValue {
  baseCurrency: string;
  rates: ExchangeRate[];
  loading: boolean;
  switchCurrency: (code: string) => Promise<void>;
  reloadRates: () => Promise<void>;
  /** 汇率失效时返回 null，调用方须显式提示「汇率已失效」，不得当作 0 */
  convert: (amount: number, fromCode: string) => number | null;
  /** 该币种当前是否可用于换算 */
  isUsable: (code: string) => boolean;
}

const CACHE_KEY = "baseCurrency";
const BaseCurrencyContext = createContext<BaseCurrencyValue | undefined>(undefined);

export const BaseCurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  const [baseCurrency, setBase] = useState<string>(() => localStorage.getItem(CACHE_KEY) || "USD");
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  // 登录状态变化时必须重新拉取：Provider 挂载时用户往往还在登录页，
  // 此时没有 token，只拉一次会让顶栏永远停在「暂无币种」
  const { user } = useAuth();

  const reloadRates = useCallback(async () => {
    try {
      setRates(await getExchangeRates());
    } catch {
      setRates([]);
    }
  }, []);

  useEffect(() => {
    if (!user || !localStorage.getItem("token")) {
      setRates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const [code] = await Promise.all([getBaseCurrency(), reloadRates()]);
        setBase(code);
        localStorage.setItem(CACHE_KEY, code);
      } catch {
        /* 未登录或接口不可用时保持缓存值 */
      } finally {
        setLoading(false);
      }
    })();
  }, [user, reloadRates]);

  const switchCurrency = useCallback(async (code: string) => {
    const saved = await setBaseCurrency(code);
    setBase(saved);
    localStorage.setItem(CACHE_KEY, saved);
  }, []);

  const rateOf = useCallback(
    (code: string) => rates.find(r => r.code === code),
    [rates]
  );

  const isUsable = useCallback((code: string) => {
    const r = rateOf(code);
    return !!r && !r.isExpired && !!r.rateToUsd;
  }, [rateOf]);

  const convert = useCallback((amount: number, fromCode: string): number | null => {
    if (fromCode === baseCurrency) return amount;
    const from = rateOf(fromCode);
    const to = rateOf(baseCurrency);
    if (!from || from.isExpired || !from.rateToUsd) return null;
    if (!to || to.isExpired || !to.rateToUsd) return null;
    return (amount * from.rateToUsd) / to.rateToUsd;
  }, [baseCurrency, rateOf]);

  return (
    <BaseCurrencyContext.Provider
      value={{ baseCurrency, rates, loading, switchCurrency, reloadRates, convert, isUsable }}
    >
      {children}
    </BaseCurrencyContext.Provider>
  );
};

export const useBaseCurrency = (): BaseCurrencyValue => {
  const ctx = useContext(BaseCurrencyContext);
  if (!ctx) throw new Error("useBaseCurrency 必须在 BaseCurrencyProvider 内使用");
  return ctx;
};
