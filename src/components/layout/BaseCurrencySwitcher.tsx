import React, { useState } from "react";
import { Coins, Check, AlertTriangle, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useBaseCurrency } from "../../contexts/BaseCurrencyContext";
import { useToast } from "../../hooks/use-toast";

/** 顶栏本位币切换：所有汇总金额按所选币种展示 */
const BaseCurrencySwitcher = () => {
  const { baseCurrency, rates, switchCurrency } = useBaseCurrency();
  const [switching, setSwitching] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSwitch = async (code: string) => {
    if (code === baseCurrency) return;
    try {
      setSwitching(code);
      await switchCurrency(code);
      toast({ description: `本位币已切换为 ${code}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "切换失败", description: e?.message || "请稍后重试" });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors"
          title="切换本位币"
        >
          <Coins className="h-5 w-5" />
          <span className="text-sm font-medium">{baseCurrency}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>本位币</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rates.length === 0 && (
          <DropdownMenuItem disabled>暂无币种</DropdownMenuItem>
        )}
        {rates.map((r) => (
          <DropdownMenuItem
            key={r.code}
            onClick={() => handleSwitch(r.code)}
            disabled={switching !== null || (r.isExpired && r.code !== baseCurrency)}
          >
            <span className="flex-1">
              {r.code} <span className="text-muted-foreground">{r.name}</span>
            </span>
            {switching === r.code && <Loader2 className="h-4 w-4 animate-spin" />}
            {r.code === baseCurrency && switching === null && <Check className="h-4 w-4" />}
            {/* 失效币种不能作为本位币，否则所有换算都无从计算 */}
            {r.isExpired && r.code !== baseCurrency && (
              <AlertTriangle className="h-4 w-4 text-destructive" aria-label="汇率已失效" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default BaseCurrencySwitcher;
