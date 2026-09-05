import React, { useState, useEffect, useCallback, useMemo } from "react";
import PageLayout from "@/components/layout/PageLayout";
import { useBaseCurrency } from "@/contexts/BaseCurrencyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Pencil, Trash2, TrendingUp, PieChart, Loader2, DollarSign, ArrowDownToLine, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

// ====== 类型定义 ======
interface Shareholder {
  id: number;
  name: string;
  share_ratio: number;
  contact?: string;
  notes?: string;
  project_id: number;
}

interface ContributionRow {
  id: number;
  name: string;
  share_ratio: number;
  total_contribution: number;
  expected_contribution: number;
  difference: number;
}

interface DividendRow {
  id: number;
  name: string;
  share_ratio: number;
  total_dividend: number;
  entitled_dividend: number;
  remaining_dividend: number;
}

// ====== 股东表单对话框 ======
/* 选项为空时不能只给一个选不动的下拉：空的 SelectContent 展开后是一条
   空白窄条，会盖住整个弹窗，连「取消」都点不到，用户只能按 Esc 脱身。
   与 SecondLevelPicker 保持同一种表达方式。 */
const EmptyHint = ({ text }: { text: string }) => (
  <div className="flex items-start gap-2 text-sm text-destructive border rounded-md p-2">
    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
    <span>{text}</span>
  </div>
);

function ShareholderFormDialog({
  open, onClose, onSuccess, shareholder, currentRatioSum,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  shareholder?: Shareholder | null;
  currentRatioSum: number;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [shareRatio, setShareRatio] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (shareholder) {
      setName(shareholder.name);
      setShareRatio(String(shareholder.share_ratio));
      setContact(shareholder.contact || "");
      setNotes(shareholder.notes || "");
    } else {
      setName(""); setShareRatio(""); setContact(""); setNotes("");
    }
  }, [shareholder, open]);

  // share_ratio 可能以字符串形式到达（PG numeric），不加 Number() 会变成字符串拼接，
  // 后面的 maxRatio.toFixed() 便抛 TypeError，导致编辑弹窗直接打不开
  const maxRatio = shareholder
    ? 100 - currentRatioSum + Number(shareholder.share_ratio)
    : 100 - currentRatioSum;

  const handleSubmit = async () => {
    if (!name.trim()) { toast({ title: "请输入股东姓名", variant: "destructive" }); return; }
    const ratio = parseFloat(shareRatio);
    if (isNaN(ratio) || ratio <= 0 || ratio > 100) {
      toast({ title: "股份比例必须在 0.01~100 之间", variant: "destructive" }); return;
    }
    if (ratio > maxRatio) {
      toast({ title: `股份比例超出限制，最多可设置 ${maxRatio.toFixed(2)}%`, variant: "destructive" }); return;
    }

    setLoading(true);
    try {
      if (shareholder) {
        await apiRequest("PUT", `/api/shareholders/${shareholder.id}`, { name, share_ratio: ratio, contact, notes });
        toast({ title: "股东更新成功" });
      } else {
        await apiRequest("POST", `/api/shareholders`, { name, share_ratio: ratio, contact, notes });
        toast({ title: "股东添加成功" });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "操作失败", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{shareholder ? "编辑股东" : "添加股东"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>股东姓名 *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="请输入股东姓名" />
          </div>
          <div className="space-y-2">
            <Label>股份比例 (%) *</Label>
            <Input type="number" step="0.01" min="0.01" max={maxRatio}
              value={shareRatio} onChange={e => setShareRatio(e.target.value)}
              placeholder={`最多 ${maxRatio.toFixed(2)}%`} />
            <p className="text-xs text-muted-foreground">当前已分配 {(100 - maxRatio).toFixed(2)}%，最多可分配 {maxRatio.toFixed(2)}%</p>
          </div>
          <div className="space-y-2">
            <Label>联系方式</Label>
            <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="手机/邮箱（可选）" />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="备注信息（可选）" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {shareholder ? "保存" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====== 股东交易对话框（入资/分红）======
interface Account { id: number; name: string; currency_type: string; balance: string; }

function ShareholderTransactionDialog({
  open, onClose, onSuccess, shareholders, mode,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  shareholders: Shareholder[];
  mode: "contribution" | "dividend";
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [shareholderId, setShareholderId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  // 入资/分红须走审批，审批链的第一级是申请人所属部门主管，故必须指定部门
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    if (open) {
      setShareholderId(""); setAccountId(""); setAmount(""); setDescription(""); setDepartmentId("");
      apiRequest("GET", "/api/accounts?limit=200").then(res => {
        const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setAccounts(items);
      }).catch(() => {});
      apiRequest("GET", "/api/departments").then(res => {
        setDepartments(Array.isArray(res.data) ? res.data : []);
      }).catch(() => {});
    }
  }, [open]);

  const title = mode === "contribution" ? "股东入资" : "股东分红";
  // 入资/分红由一级流水类型标识。原先靠 income-shareholder / expense-dividend
  // 两个科目 code 识别，而科目改为按流水类型分池后这两个 code 已不存在，
  // 提交必然停在「未找到科目」上
  const transactionTypeCode = mode === "contribution" ? "shareholder_investment" : "shareholder_dividend";
  const txType = mode === "contribution" ? "income" : "expense";

  const handleSubmit = async () => {
    if (!shareholderId) { toast({ title: "请选择股东", variant: "destructive" }); return; }
    if (!accountId) { toast({ title: "请选择账户", variant: "destructive" }); return; }
    if (!departmentId) { toast({ title: "请选择部门", variant: "destructive" }); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast({ title: "请输入有效金额", variant: "destructive" }); return; }

    setLoading(true);
    try {
      const shName = shareholders.find(s => s.id === parseInt(shareholderId))?.name || "";
      // 入资/分红同样是收入/支出，不能绕过审批直接记账：
      // 提交申请单，审批通过并执行后由系统生成流水。
      // 账户与科目在此已确定，随申请一并预置为归帐结果。
      const res = await apiRequest("POST", "/api/applications", {
        type: txType,
        title: `${title} - ${shName}`,
        amount: amt,
        departmentId: parseInt(departmentId),
        shareholderId: parseInt(shareholderId),
        accountId: parseInt(accountId),
        // 二级选的是股东本人（shareholderId），不再挂科目
        transaction_type_code: transactionTypeCode,
        description: description || `${title} - ${shName}`,
      });
      if (!res?.success) throw new Error(res?.message || "提交失败");

      toast({
        title: `${title}申请已提交`,
        description: "审批通过并执行后将自动生成流水",
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "操作失败", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>选择股东 *</Label>
            {shareholders.length === 0 ? (
              <EmptyHint text="还没有股东，请先在本页「添加股东」中创建" />
            ) : (
            <Select value={shareholderId} onValueChange={setShareholderId}>
              <SelectTrigger><SelectValue placeholder="请选择股东" /></SelectTrigger>
              <SelectContent>
                {shareholders.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} ({Number(s.share_ratio).toFixed(2)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>所属部门 *</Label>
            {departments.length === 0 ? (
              <EmptyHint text="还没有部门，请先在「人员管理 → 部门配置」中添加" />
            ) : (
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue placeholder="请选择部门" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>选择账户 *</Label>
            {accounts.length === 0 ? (
              <EmptyHint text="还没有账户，请先在「账户管理」中添加" />
            ) : (
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="请选择账户" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.currency_type} ¥{Number(a.balance).toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>金额 *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="请输入金额" />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)}
              placeholder={`${title}备注（可选）`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认{title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ====== 主页面 ======
export default function ShareholderManagement() {
  const { toast } = useToast();
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShareholder, setEditingShareholder] = useState<Shareholder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shareholder | null>(null);

  // 入资/分红交易
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txMode, setTxMode] = useState<"contribution" | "dividend">("contribution");

  // 入资分析
  const [contributionData, setContributionData] = useState<{ shareholders: ContributionRow[]; total_contribution: number } | null>(null);
  const [contributionLoading, setContributionLoading] = useState(false);

  // 分红计算
  const [dividendData, setDividendData] = useState<any>(null);
  const [dividendLoading, setDividendLoading] = useState(false);

  const { baseCurrency, convert, rates } = useBaseCurrency();

  // 金额一律带上本位币，不能再写死 ¥ —— 折算之后这些数已经是本位币口径了
  const cur = (v: number) => `${baseCurrency} ${fmt(v)}`;

  /**
   * 服务端按「股东 + 币种」返回明细，这里折算成本位币后再按股东合并。
   *
   * 折算必须放在前端：此前服务端直接 SUM(amount) 把 CNY 和 USD 加在一起，
   * 实测总收入被算成 920241.54 CNY + 6200 USD = 926441.54，6200 美元被当成
   * 6200 元计进了净利润 —— 而净利润是分红的基数，它错了每个股东该分多少
   * 就跟着错，界面上完全看不出来。
   *
   * 与总资产、仪表盘一致：只要有一个币种汇率失效就整体报错，不做
   * 「跳过该币种」—— 少算一个币种的分红看上去正常，实际是错的。
   */
  const mergeByShareholder = useCallback((rows: any[], amountKey: string) => {
    const acc = new Map<number, any>();
    const bad = new Set<string>();
    for (const r of rows || []) {
      const raw = Number(r[amountKey] ?? 0);
      const cur = r.currency_type;
      const v = cur ? convert(raw, cur) : raw;
      if (v === null) { bad.add(cur); continue; }
      const prev = acc.get(r.id) || { id: r.id, name: r.name, share_ratio: Number(r.share_ratio), amount: 0 };
      prev.amount += v;
      acc.set(r.id, prev);
    }
    return { list: [...acc.values()], bad: [...bad] };
  }, [convert, rates, baseCurrency]);

  const contributionView = useMemo(() => {
    if (!contributionData) return null;
    const { list, bad } = mergeByShareholder(contributionData.shareholders, 'total_contribution');
    if (bad.length) return { error: `${bad.join('、')} 汇率已失效，请先在「配置管理 → 账户配置 → 币种管理」中更新` };
    const total = list.reduce((s, x) => s + x.amount, 0);
    return {
      total_contribution: Math.round(total * 100) / 100,
      shareholders: list
        .map(x => {
          const expected = total > 0 ? Math.round(total * x.share_ratio) / 100 : 0;
          return {
            ...x,
            total_contribution: Math.round(x.amount * 100) / 100,
            expected_contribution: expected,
            difference: Math.round((x.amount - expected) * 100) / 100,
          };
        })
        .sort((a, b) => b.share_ratio - a.share_ratio),
    };
  }, [contributionData, mergeByShareholder]);

  const dividendView = useMemo(() => {
    if (!dividendData) return null;
    const bad = new Set<string>();
    let income = 0, expense = 0;
    for (const f of dividendData.financials || []) {
      const v = f.currency_type ? convert(Number(f.total), f.currency_type) : Number(f.total);
      if (v === null) { bad.add(f.currency_type); continue; }
      if (f.type === 'income') income += v; else expense += v;
    }
    const merged = mergeByShareholder(dividendData.shareholders, 'total_dividend');
    merged.bad.forEach(c => bad.add(c));
    if (bad.size) return { error: `${[...bad].join('、')} 汇率已失效，请先在「配置管理 → 账户配置 → 币种管理」中更新` };

    const netProfit = Math.round((income - expense) * 100) / 100;
    const paid = merged.list.reduce((s, x) => s + x.amount, 0);
    return {
      total_income: Math.round(income * 100) / 100,
      total_expense: Math.round(expense * 100) / 100,
      net_profit: netProfit,
      total_dividend_paid: Math.round(paid * 100) / 100,
      distributable: Math.max(0, Math.round((netProfit - paid) * 100) / 100),
      shareholders: merged.list
        .map(x => {
          const entitled = netProfit > 0 ? Math.round(netProfit * x.share_ratio) / 100 : 0;
          return {
            ...x,
            total_dividend: Math.round(x.amount * 100) / 100,
            entitled_dividend: entitled,
            remaining_dividend: Math.round((entitled - x.amount) * 100) / 100,
          };
        })
        .sort((a, b) => b.share_ratio - a.share_ratio),
    };
  }, [dividendData, convert, rates, baseCurrency, mergeByShareholder]);

  const loadShareholders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/shareholders");
      setShareholders(res.data || []);
    } catch (err: any) {
      toast({ title: "加载股东列表失败", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadContribution = useCallback(async () => {
    setContributionLoading(true);
    try {
      const res = await apiRequest("GET", "/api/shareholders?action=contribution-summary");
      setContributionData(res.data);
    } catch (err: any) {
      toast({ title: "加载入资分析失败", description: err.message, variant: "destructive" });
    } finally {
      setContributionLoading(false);
    }
  }, [toast]);

  const loadDividend = useCallback(async () => {
    setDividendLoading(true);
    try {
      const res = await apiRequest("GET", "/api/shareholders?action=dividend-summary");
      setDividendData(res.data);
    } catch (err: any) {
      toast({ title: "加载分红数据失败", description: err.message, variant: "destructive" });
    } finally {
      setDividendLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadShareholders(); }, [loadShareholders]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest("DELETE", `/api/shareholders/${deleteTarget.id}`);
      toast({ title: "股东已删除" });
      loadShareholders();
    } catch (err: any) {
      toast({ title: "删除失败", description: err.message, variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const currentRatioSum = shareholders.reduce((sum, s) => sum + Number(s.share_ratio), 0);

  const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <PageLayout title="股东管理" subtitle="管理项目股东、股份比例、入资分析和分红计算">
      <Tabs defaultValue="list" onValueChange={(v) => {
        if (v === "contribution") loadContribution();
        if (v === "dividend") loadDividend();
      }}>
        <TabsList className="mb-4">
          <TabsTrigger value="list"><Users className="h-4 w-4 mr-1" />股东列表</TabsTrigger>
          <TabsTrigger value="contribution"><TrendingUp className="h-4 w-4 mr-1" />入资分析</TabsTrigger>
          <TabsTrigger value="dividend"><PieChart className="h-4 w-4 mr-1" />分红计算</TabsTrigger>
        </TabsList>

        {/* ====== Tab 1: 股东列表 ====== */}
        <TabsContent value="list">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">
                股东列表
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  已分配 {currentRatioSum.toFixed(2)}% / 100%
                </span>
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={shareholders.length === 0}
                  onClick={() => { setTxMode("contribution"); setTxDialogOpen(true); }}>
                  <ArrowDownToLine className="h-4 w-4 mr-1" />入资
                </Button>
                <Button variant="outline" size="sm" disabled={shareholders.length === 0}
                  onClick={() => { setTxMode("dividend"); setTxDialogOpen(true); }}>
                  <DollarSign className="h-4 w-4 mr-1" />分红
                </Button>
                <Button size="sm" onClick={() => { setEditingShareholder(null); setDialogOpen(true); }}
                  disabled={currentRatioSum >= 100}>
                  <Plus className="h-4 w-4 mr-1" />添加股东
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* 比例进度条 */}
              <div className="mb-4">
                <Progress value={currentRatioSum} className="h-3" />
              </div>

              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : shareholders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无股东数据，请点击「添加股东」</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>股东姓名</TableHead>
                      <TableHead className="text-right">股份比例</TableHead>
                      <TableHead>联系方式</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shareholders.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{Number(s.share_ratio).toFixed(2)}%</TableCell>
                        <TableCell>{s.contact || "-"}</TableCell>
                        <TableCell>{s.notes || "-"}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => { setEditingShareholder(s); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab 2: 入资分析 ====== */}
        <TabsContent value="contribution">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">入资分析</CardTitle>
            </CardHeader>
            <CardContent>
              {contributionLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : contributionView?.error ? (
                // 汇率失效不能显示成「暂无数据」—— 那会让人以为真的没有入资记录
                <div className="flex items-start gap-2 text-sm text-destructive border rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{contributionView.error}</span>
                </div>
              ) : !contributionView || (contributionView.shareholders?.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无股东入资数据</div>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600">入资总额：<span className="text-lg font-bold">{cur(contributionView.total_contribution)}</span></p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>股东</TableHead>
                        <TableHead className="text-right">股份比例</TableHead>
                        <TableHead className="text-right">应入资额</TableHead>
                        <TableHead className="text-right">实际入资</TableHead>
                        <TableHead className="text-right">差额</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contributionView.shareholders.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">{Number(row.share_ratio).toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{cur(row.expected_contribution)}</TableCell>
                          <TableCell className="text-right">{cur(row.total_contribution)}</TableCell>
                          <TableCell className={`text-right font-medium ${row.difference > 0 ? 'text-green-600' : row.difference < 0 ? 'text-red-600' : ''}`}>
                            {row.difference > 0 ? '+' : ''}{fmt(row.difference)}
                          </TableCell>
                          <TableCell>
                            {row.difference > 0 ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">多入</span>
                            ) : row.difference < 0 ? (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">少入</span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">匹配</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab 3: 分红计算 ====== */}
        <TabsContent value="dividend">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">分红计算</CardTitle>
            </CardHeader>
            <CardContent>
              {dividendLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : dividendView?.error ? (
                <div className="flex items-start gap-2 text-sm text-destructive border rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{dividendView.error}</span>
                </div>
              ) : !dividendView ? (
                <div className="text-center py-8 text-muted-foreground">暂无数据</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">总收入</p>
                      <p className="text-lg font-bold text-green-700">{cur(dividendView.total_income)}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600">总支出</p>
                      <p className="text-lg font-bold text-red-700">{cur(dividendView.total_expense)}</p>
                    </div>
                    <div className={`p-4 rounded-lg ${dividendView.net_profit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                      <p className="text-xs text-blue-600">净利润</p>
                      <p className={`text-lg font-bold ${dividendView.net_profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                        {cur(dividendView.net_profit)}
                      </p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600">剩余可分配</p>
                      <p className="text-lg font-bold text-purple-700">{cur(dividendView.distributable)}</p>
                    </div>
                  </div>

                  {dividendView.shareholders.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">暂无股东</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>股东</TableHead>
                          <TableHead className="text-right">股份比例</TableHead>
                          <TableHead className="text-right">应得分红</TableHead>
                          <TableHead className="text-right">已分红</TableHead>
                          <TableHead className="text-right">剩余可分</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dividendView.shareholders.map((row: DividendRow) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="text-right">{Number(row.share_ratio).toFixed(2)}%</TableCell>
                            <TableCell className="text-right">{cur(row.entitled_dividend)}</TableCell>
                            <TableCell className="text-right">{cur(row.total_dividend)}</TableCell>
                            <TableCell className={`text-right font-medium ${row.remaining_dividend > 0 ? 'text-green-600' : row.remaining_dividend < 0 ? 'text-red-600' : ''}`}>
                              {cur(row.remaining_dividend)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 添加/编辑对话框 */}
      <ShareholderFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={loadShareholders}
        shareholder={editingShareholder}
        currentRatioSum={currentRatioSum}
      />

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除股东「{deleteTarget?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 入资/分红交易对话框 */}
      <ShareholderTransactionDialog
        open={txDialogOpen}
        onClose={() => setTxDialogOpen(false)}
        onSuccess={() => { loadShareholders(); loadContribution(); loadDividend(); }}
        shareholders={shareholders}
        mode={txMode}
      />
    </PageLayout>
  );
}
