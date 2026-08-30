import React, { useState, useEffect, useCallback } from "react";
import PageLayout from "@/components/layout/PageLayout";
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
import { Users, Plus, Pencil, Trash2, TrendingUp, PieChart, Loader2, DollarSign, ArrowDownToLine } from "lucide-react";
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

  useEffect(() => {
    if (open) {
      setShareholderId(""); setAccountId(""); setAmount(""); setDescription("");
      apiRequest("GET", "/api/accounts").then(res => {
        const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setAccounts(items);
      }).catch(() => {});
    }
  }, [open]);

  const title = mode === "contribution" ? "股东入资" : "股东分红";
  const subjectCode = mode === "contribution" ? "income-shareholder" : "expense-dividend";
  const txType = mode === "contribution" ? "income" : "expense";

  const handleSubmit = async () => {
    if (!shareholderId) { toast({ title: "请选择股东", variant: "destructive" }); return; }
    if (!accountId) { toast({ title: "请选择账户", variant: "destructive" }); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast({ title: "请输入有效金额", variant: "destructive" }); return; }

    setLoading(true);
    try {
      // 先获取科目 ID
      const subjectsRes = await apiRequest("GET", "/api/subjects");
      const subjects = subjectsRes.data || [];
      const subject = subjects.find((s: any) => s.code === subjectCode);
      if (!subject) {
        toast({ title: `未找到「${title}」科目，请先在配置管理中创建`, variant: "destructive" });
        setLoading(false);
        return;
      }

      await apiRequest("POST", "/api/transactions", {
        type: txType,
        amount: amt,
        account_id: parseInt(accountId),
        subject_id: subject.id,
        shareholder_id: parseInt(shareholderId),
        description: description || `${title} - ${shareholders.find(s => s.id === parseInt(shareholderId))?.name || ""}`,
      });

      toast({ title: `${title}记录创建成功` });
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
          </div>
          <div className="space-y-2">
            <Label>选择账户 *</Label>
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
              ) : !contributionData || contributionData.shareholders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无股东入资数据</div>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600">入资总额：<span className="text-lg font-bold">¥{fmt(contributionData.total_contribution)}</span></p>
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
                      {contributionData.shareholders.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">{Number(row.share_ratio).toFixed(2)}%</TableCell>
                          <TableCell className="text-right">¥{fmt(row.expected_contribution)}</TableCell>
                          <TableCell className="text-right">¥{fmt(row.total_contribution)}</TableCell>
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
              ) : !dividendData ? (
                <div className="text-center py-8 text-muted-foreground">暂无数据</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">总收入</p>
                      <p className="text-lg font-bold text-green-700">¥{fmt(dividendData.total_income)}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600">总支出</p>
                      <p className="text-lg font-bold text-red-700">¥{fmt(dividendData.total_expense)}</p>
                    </div>
                    <div className={`p-4 rounded-lg ${dividendData.net_profit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                      <p className="text-xs text-blue-600">净利润</p>
                      <p className={`text-lg font-bold ${dividendData.net_profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                        ¥{fmt(dividendData.net_profit)}
                      </p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600">剩余可分配</p>
                      <p className="text-lg font-bold text-purple-700">¥{fmt(dividendData.distributable)}</p>
                    </div>
                  </div>

                  {dividendData.shareholders.length === 0 ? (
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
                        {dividendData.shareholders.map((row: DividendRow) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="text-right">{Number(row.share_ratio).toFixed(2)}%</TableCell>
                            <TableCell className="text-right">¥{fmt(row.entitled_dividend)}</TableCell>
                            <TableCell className="text-right">¥{fmt(row.total_dividend)}</TableCell>
                            <TableCell className={`text-right font-medium ${row.remaining_dividend > 0 ? 'text-green-600' : row.remaining_dividend < 0 ? 'text-red-600' : ''}`}>
                              ¥{fmt(row.remaining_dividend)}
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
