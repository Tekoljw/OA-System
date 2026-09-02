
import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Plus, Edit, Trash2, FileQuestion, Loader2, RefreshCw, AlertTriangle, Check } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { Card, CardContent } from "../ui/card";
import { useIsMobile } from "../../hooks/use-mobile";
import { 
  createCurrencyType, 
  updateCurrencyType, 
  deleteCurrencyType 
} from "../../utils/config-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  ExchangeRate,
  getExchangeRates,
  updateExchangeRate,
  refreshExchangeRates,
} from "../../utils/exchange-rate-api";
import { useBaseCurrency } from "../../contexts/BaseCurrencyContext";
import { usePermissions } from "../../hooks/use-permissions";

const CurrencyTypeManager = () => {
  // 汇率接口返回的字段是币种接口的超集，用它一次取全，避免两次请求
  const [currencies, setCurrencies] = useState<ExchangeRate[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<ExchangeRate | null>(null);
  const [deletingCurrencyId, setDeletingCurrencyId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", description: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // 行内编辑草稿：key 为币种 id，只在用户改动后才与服务端值不同
  const [drafts, setDrafts] = useState<Record<string, { rate: string; hours: string }>>({});
  // 正在保存的行（按 id 标记，避免整表禁用）
  const [savingId, setSavingId] = useState<string | null>(null);
  // 用户动过哪些输入框。只看「值是否变化」不够：重填同一个汇率也是一次维护，
  // 应当续期；而只是点进输入框又点走，不该触发任何写入。
  const [touched, setTouched] = useState<Record<string, { rate?: boolean; hours?: boolean }>>({});
  // 倒计时：以服务端返回的剩余秒数为基准，本地每秒递减
  const [ticks, setTicks] = useState<Record<string, number | null>>({});
  const { toast } = useToast();
  const { reloadRates, baseCurrency } = useBaseCurrency();
  // 汇率只能由会计维护：它直接决定所有换算结果，等同于账目口径
  const { can } = usePermissions();
  // 两种权限在这一页并存：汇率归会计维护，币种本身的增删改归配置管理。
  // 会计能进这页是为了改汇率，不该看到能点却必然 403 的「添加币种」
  const canMaintainRate = can('manage_accounting');
  const canManageCurrency = can('manage_configurations');

  /** 列表变化时重置草稿与倒计时基准（不覆盖用户正在输入的行） */
  const syncFromServer = (list: ExchangeRate[], keepDraftId?: string) => {
    setCurrencies(list);
    setDrafts(prev => {
      const next: Record<string, { rate: string; hours: string }> = {};
      for (const c of list) {
        next[c.id] = (keepDraftId && keepDraftId === c.id && prev[c.id])
          ? prev[c.id]
          : { rate: c.rateToUsd !== null ? String(c.rateToUsd) : "", hours: String(c.validHours) };
      }
      return next;
    });
    setTicks(Object.fromEntries(list.map(c => [c.id, c.expiresInSeconds])));
  };

  // 倒计时每秒走一格；到 0 即失效，不再往下减
  useEffect(() => {
    const timer = setInterval(() => {
      setTicks(prev => {
        const next: Record<string, number | null> = {};
        let changed = false;
        for (const [id, v] of Object.entries(prev)) {
          if (v === null || v <= 0) { next[id] = v; continue; }
          next[id] = v - 1;
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取币种数据
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        setIsLoading(true);
        syncFromServer(await getExchangeRates());
      } catch (error: any) {
        console.error("获取币种列表失败:", error);
        setCurrencies([]);
        toast({
          variant: "destructive",
          title: "获取币种列表失败",
          description: error?.message || "无法连接到服务器获取币种数据，请稍后重试",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrencies();
  }, [toast]);

  const handleAdd = () => {
    setEditingCurrency(null);
    setFormData({ name: "", code: "", description: "" });
    setIsDialogOpen(true);
  };

  const handleEdit = (currency: ExchangeRate) => {
    setEditingCurrency(currency);
    setFormData({ 
      name: currency.name, 
      code: currency.code,
      description: currency.description || ""
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingCurrencyId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCurrencyId) return;
    
    try {
      setIsSubmitting(true);
      await deleteCurrencyType(deletingCurrencyId);
      setCurrencies(currencies.filter(c => c.id !== deletingCurrencyId));
      toast({
        description: "币种已删除",
      });
    } catch (error: any) {
      console.error("删除币种失败:", error);
      
      // 提取API返回的错误消息
      let errorMsg = "请稍后再试或联系管理员";
      if (error.response && error.response.data && error.response.data.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      toast({
        variant: "destructive",
        title: "删除币种失败",
        description: errorMsg,
      });
    } finally {
      setIsSubmitting(false);
      setIsDeleteDialogOpen(false);
      setDeletingCurrencyId(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.code) {
      toast({
        variant: "destructive",
        description: "币种名称和代码不能为空",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (editingCurrency) {
        // 更新币种
        const updated = await updateCurrencyType(editingCurrency.id, {
          name: formData.name,
          description: formData.description
        });
        
        setCurrencies(currencies.map(c =>
          c.id === editingCurrency.id ? { ...c, name: updated.name, description: updated.description } : c
        ));
        
        toast({
          description: "币种已更新",
        });
      } else {
        // 创建币种 - 确保币种代码为大写
        await createCurrencyType({
          name: formData.name,
          code: formData.code.toUpperCase(), // 强制转为大写
          description: formData.description
        });
        
        // 新币种尚无汇率，重取以拿到 isExpired 等字段
        syncFromServer(await getExchangeRates());
        
        toast({
          description: "新币种已添加",
        });
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("保存币种失败:", error);
      toast({
        variant: "destructive",
        title: "保存币种失败",
        description: error.message || "请稍后再试或联系管理员",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== 汇率 ====================

  /** 统一的行内保存入口：开关、汇率、有效期都走它 */
  const saveRow = async (c: ExchangeRate, payload: any, successMsg: string) => {
    try {
      setSavingId(c.id);
      const saved = await updateExchangeRate(c.id, payload);
      const list = currencies.map(x => (x.id === saved.id ? saved : x));
      syncFromServer(list);
      await reloadRates();
      toast({ description: successMsg });
      return true;
    } catch (error: any) {
      toast({ variant: "destructive", title: "保存失败", description: error.message || "请稍后再试" });
      // 失败时把草稿退回服务端值，避免界面显示一个并未生效的数字
      syncFromServer(currencies);
      return false;
    } finally {
      setSavingId(null);
    }
  };

  /** 行内开关：立即生效，无需再点保存 */
  const handleToggleAuto = async (c: ExchangeRate, on: boolean) => {
    // 关掉自动获取而该币种从未有过汇率时，等于立刻失效，先提醒
    if (!on && c.rateToUsd === null) {
      toast({ description: `${c.code} 已切换为手动维护，请在本行填写汇率` });
    }
    await saveRow(c, { autoFetch: on }, `${c.code} 已切换为${on ? "自动获取" : "手动维护"}`);
    if (on) {
      // 开启后立即取一次价，否则要等下一次读取才补齐
      try {
        await refreshExchangeRates();
        syncFromServer(await getExchangeRates());
        await reloadRates();
      } catch { /* 取价失败不影响开关本身，列表会显示失效 */ }
    }
  };

  /** 行内汇率保存 */
  const handleSaveRate = async (c: ExchangeRate) => {
    const raw = (drafts[c.id]?.rate ?? "").trim();
    if (raw === "") {
      toast({ variant: "destructive", description: "汇率不能为空" });
      return;
    }
    const rate = Number(raw);
    if (!isFinite(rate) || rate <= 0) {
      toast({ variant: "destructive", description: "汇率必须是大于 0 的数字" });
      return;
    }
    // 不比较是否与旧值相同：重新确认一次汇率就是一次维护，
    // 后端会刷新 rate_updated_at，有效期从此刻重新计算
    await saveRow(c, { rateToUsd: rate }, `${c.code} 汇率已更新，有效期重新计时`);
    clearTouched(c.id, "rate");
  };

  /** 行内有效期保存 */
  const handleSaveHours = async (c: ExchangeRate) => {
    const hours = parseInt((drafts[c.id]?.hours ?? "").trim(), 10);
    if (!hours || hours < 1 || hours > 8760) {
      toast({ variant: "destructive", description: "有效期必须是 1 到 8760 之间的小时数" });
      syncFromServer(currencies);
      clearTouched(c.id, "hours");
      return;
    }
    if (hours === c.validHours) { clearTouched(c.id, "hours"); return; }
    await saveRow(c, { validHours: hours }, `${c.code} 有效期已改为 ${hours} 小时，剩余时间已重算`);
    clearTouched(c.id, "hours");
  };

  const setDraft = (id: string, patch: Partial<{ rate: string; hours: string }>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } as { rate: string; hours: string } }));
    setTouched(prev => ({
      ...prev,
      [id]: { ...prev[id], ...("rate" in patch ? { rate: true } : {}), ...("hours" in patch ? { hours: true } : {}) },
    }));
  };

  const clearTouched = (id: string, field: "rate" | "hours") =>
    setTouched(prev => ({ ...prev, [id]: { ...prev[id], [field]: false } }));

  const handleRefreshAll = async () => {
    try {
      setIsRefreshing(true);
      const r = await refreshExchangeRates();
      syncFromServer(await getExchangeRates());
      await reloadRates();
      const failedCodes = Object.keys(r.failed || {});
      if (r.updated.length === 0 && failedCodes.length === 0) {
        toast({ description: "没有开启自动获取的币种" });
      } else if (failedCodes.length) {
        toast({
          variant: "destructive",
          title: `已更新 ${r.updated.length} 个，${failedCodes.length} 个失败`,
          description: failedCodes.map(c => `${c}：${r.failed[c]}`).join("；"),
        });
      } else {
        toast({ description: `已更新：${r.updated.join("、")}` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "刷新失败", description: error.message || "请稍后再试" });
    } finally {
      setIsRefreshing(false);
    }
  };

  /** 秒数 → 「12小时34分56秒」 */
  const formatCountdown = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s2 = sec % 60;
    return `${h}小时${String(m).padStart(2, "0")}分${String(s2).padStart(2, "0")}秒`;
  };

  /**
   * 有效期倒计时：进度条 + 时分秒。
   * 剩余比例按 valid_hours 折算，低于 20% 转黄、失效转红，
   * 让「快要到期」在扫一眼时就能看出来，而不是等它已经失效才发现。
   */
  const renderCountdown = (c: ExchangeRate) => {
    if (c.isAnchor) return <span className="text-muted-foreground">基准币种，永不失效</span>;
    // 自动获取由系统持续从公开报价刷新，没有「过期」这回事，也就不需要倒计时
    if (c.autoFetch) {
      return c.rateToUsd !== null
        ? <span className="text-muted-foreground text-sm">自动获取，不会失效</span>
        : <span className="text-destructive text-sm">尚未取到报价</span>;
    }
    const left = ticks[c.id];
    if (left === null || left === undefined) {
      return <span className="text-destructive text-sm">从未维护，汇率不可用</span>;
    }
    if (left <= 0) {
      return (
        <div className="space-y-1">
          <Progress value={0} className="h-2 [&>div]:bg-destructive" />
          <span className="text-xs text-destructive">已失效，请更新汇率</span>
        </div>
      );
    }
    const total = c.validHours * 3600;
    const pct = Math.min(100, (left / total) * 100);
    const barColor = pct < 20 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500";
    return (
      <div className="space-y-1 min-w-[150px]">
        <Progress value={pct} className={`h-2 ${barColor}`} />
        <span className="text-xs text-muted-foreground font-mono">剩余 {formatCountdown(left)}</span>
      </div>
    );
  };

  /** 汇率列：自动模式只读展示，手动模式直接在表格里改 */
  const renderRateCell = (c: ExchangeRate) => {
    if (c.isAnchor) return <span className="text-muted-foreground">1.00（基准）</span>;

    if (c.autoFetch) {
      return c.rateToUsd !== null ? (
        <span className="font-mono">{c.rateToUsd.toFixed(6)}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />尚未取到报价
        </span>
      );
    }

    const draft = drafts[c.id]?.rate ?? "";
    const dirty = !!touched[c.id]?.rate;
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="0.00000001"
          className={`h-8 w-32 font-mono ${dirty ? "border-amber-500 ring-1 ring-amber-500" : ""}`}
          value={draft}
          placeholder="填写汇率"
          disabled={savingId === c.id || !canMaintainRate}
          onChange={(e) => setDraft(c.id, { rate: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          // 失焦即保存：只靠回车或点按钮，用户改完点别处就以为存上了，实际没提交
          onBlur={() => { if (touched[c.id]?.rate) handleSaveRate(c); }}
        />
        {savingId === c.id
          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          : dirty && (
            <Button size="sm" variant="secondary" className="h-8 px-2"
              onMouseDown={(e) => e.preventDefault()} onClick={() => handleSaveRate(c)}>
              <Check className="h-3.5 w-3.5 mr-1" />保存
            </Button>
          )}
      </div>
    );
  };

  /** 有效期列：手动、自动都可改 */
  const renderHoursCell = (c: ExchangeRate) => {
    if (c.isAnchor) return <span className="text-muted-foreground">—</span>;
    // 有效期只对手动维护有意义
    if (c.autoFetch) return <span className="text-muted-foreground">—</span>;
    const draft = drafts[c.id]?.hours ?? "";
    const dirty = !!touched[c.id]?.hours;
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number" min={1} max={8760}
          className={`h-8 w-20 ${dirty ? "border-amber-500 ring-1 ring-amber-500" : ""}`}
          value={draft}
          disabled={savingId === c.id || !canMaintainRate}
          onChange={(e) => setDraft(c.id, { hours: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onBlur={() => { if (touched[c.id]?.hours) handleSaveHours(c); }}
        />
        <span className="text-xs text-muted-foreground">小时</span>
        {savingId === c.id
          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          : dirty && (
            <Button size="sm" variant="secondary" className="h-8 px-2"
              onMouseDown={(e) => e.preventDefault()} onClick={() => handleSaveHours(c)}>
              <Check className="h-3.5 w-3.5 mr-1" />保存
            </Button>
          )}
      </div>
    );
  };

  const isMobile = useIsMobile();

  // 无数据时显示的组件
  const NoDataDisplay = () => (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <FileQuestion className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          暂无币种数据
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          添加币种以管理不同的货币类型
        </p>
      </div>
    </Card>
  );

  // 加载中显示
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex gap-2">
          <Button onClick={handleAdd} disabled={!canManageCurrency}
                  title={canManageCurrency ? undefined : '只有具备配置管理权限的角色可以增删币种'}>
            <Plus className="mr-2" />添加币种
          </Button>
          <Button variant="outline" onClick={handleRefreshAll}
                  disabled={isRefreshing || !canMaintainRate}
                  title={canMaintainRate ? undefined : '只有会计可以维护汇率'}>
            {isRefreshing
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新自动汇率
          </Button>
        </div>
        <div className="text-sm text-muted-foreground pr-2">
          汇率口径：1 单位该币种 = ? USD ｜ 本位币 <span className="font-medium text-foreground">{baseCurrency}</span>
          {!canMaintainRate && <span className="ml-2 text-amber-600">（只读，汇率由会计维护）</span>}
        </div>
      </div>

      {currencies.length === 0 ? (
        <NoDataDisplay />
      ) : (
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="grid gap-4 p-4">
                {currencies.map((currency) => (
                  <Card key={currency.id} className="overflow-hidden shadow-sm border hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex-1 space-y-2">
                          <div>
                            <div className="font-medium">{currency.name}</div>
                            <div className="text-sm text-muted-foreground">{currency.code}</div>
                          </div>
                          {!currency.isAnchor && (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={currency.autoFetch}
                                disabled={savingId === currency.id || !canMaintainRate}
                                onCheckedChange={(v) => handleToggleAuto(currency, v)}
                              />
                              <span className="text-xs text-muted-foreground">
                                {currency.autoFetch ? "自动获取" : "手动维护"}
                              </span>
                            </div>
                          )}
                          <div className="text-sm">{renderRateCell(currency)}</div>
                          {!currency.isAnchor && !currency.autoFetch && renderHoursCell(currency)}
                          <div className="pr-4">{renderCountdown(currency)}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" aria-label="编辑币种"
                                  disabled={!canManageCurrency}
                                  title={canManageCurrency ? '编辑币种' : '只有具备配置管理权限的角色可以编辑币种'}
                                  onClick={() => handleEdit(currency)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="删除币种"
                                  disabled={!canManageCurrency}
                                  title={canManageCurrency ? '删除币种' : '只有具备配置管理权限的角色可以删除币种'}
                                  onClick={() => handleDeleteClick(currency.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>币种名称</TableHead>
                    <TableHead>币种代码</TableHead>
                    <TableHead className="w-[190px]">汇率（对 USD）</TableHead>
                    <TableHead className="w-[150px]">自动获取</TableHead>
                    <TableHead className="w-[170px]">有效期<span className="text-xs font-normal text-muted-foreground">（仅手动）</span></TableHead>
                    <TableHead className="w-[200px]">剩余有效时间</TableHead>
                    <TableHead>最后更新</TableHead>
                    <TableHead className="w-[140px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currencies.map((currency) => (
                    <TableRow key={currency.id} className="hover:bg-muted/50 cursor-pointer">
                      <TableCell>{currency.name}</TableCell>
                      <TableCell>{currency.code}</TableCell>
                      <TableCell>{renderRateCell(currency)}</TableCell>
                      <TableCell>
                        {currency.isAnchor ? (
                          <Badge variant="secondary">基准币种</Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={currency.autoFetch}
                              disabled={savingId === currency.id || !canMaintainRate}
                              onCheckedChange={(v) => handleToggleAuto(currency, v)}
                            />
                            <span className="text-xs text-muted-foreground">
                              {currency.autoFetch ? "自动获取" : "手动维护"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{renderHoursCell(currency)}</TableCell>
                      <TableCell>{renderCountdown(currency)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {currency.isAnchor ? "—" : (currency.rateUpdatedAt || "从未维护")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" aria-label="编辑币种"
                                  disabled={!canManageCurrency}
                                  title={canManageCurrency ? '编辑币种' : '只有具备配置管理权限的角色可以编辑币种'}
                                  onClick={() => handleEdit(currency)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="删除币种"
                                  disabled={!canManageCurrency}
                                  title={canManageCurrency ? '删除币种' : '只有具备配置管理权限的角色可以删除币种'}
                                  onClick={() => handleDeleteClick(currency.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 编辑/添加对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCurrency ? "编辑币种" : "添加币种"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label>币种名称</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label>币种代码</label>
              <Input
                value={formData.code}
                disabled={!!editingCurrency}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="例如：USD, CNY, EUR"
              />
              {editingCurrency && (
                <p className="text-xs text-muted-foreground">币种代码一旦创建不可修改</p>
              )}
            </div>
            <div className="space-y-2">
              <label>币种描述</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDialogOpen(false)} variant="outline" disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                editingCurrency ? "更新" : "添加"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-2">确定要删除此币种吗？此操作无法撤销。</p>
              <p className="font-semibold text-destructive">注意：如果此币种有关联的账户，删除操作将失败。您必须先删除所有使用此币种的账户，然后才能删除币种。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CurrencyTypeManager;
