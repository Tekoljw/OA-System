import React, { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Plus, Edit, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { useToast } from "../../hooks/use-toast";
import LoadingState from "../common/LoadingState";
import EmptyState from "../common/EmptyState";
import {
  ApprovalRule, ApprovalRuleNode, getApprovalRules, createApprovalRule,
  updateApprovalRule, deleteApprovalRule, describeNodes, formatRange,
} from "../../utils/approval-rules-api";

const emptyForm = {
  name: "",
  min_amount: 0,
  max_amount: "" as number | "",
  amount_scope: "daily" as "daily" | "single",
  priority: 0,
  active: true,
  nodes: [{ step_order: 1, approver_type: "applicant_dept_manager", approver_role: null, required_count: 1 }] as ApprovalRuleNode[],
};

const ApprovalRuleManager = () => {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ApprovalRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setRules(await getApprovalRules());
    } catch (e) {
      toast({ title: "获取审批规则失败", description: String((e as Error).message), variant: "destructive" });
      setRules([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (r: ApprovalRule) => {
    setEditing(r);
    setForm({
      name: r.name,
      min_amount: Number(r.min_amount),
      max_amount: r.max_amount === null ? "" : Number(r.max_amount),
      amount_scope: r.amount_scope,
      priority: r.priority,
      active: r.active,
      nodes: r.nodes?.length ? [...r.nodes].sort((a, b) => a.step_order - b.step_order) : emptyForm.nodes,
    });
    setDialogOpen(true);
  };

  const setNode = (i: number, patch: Partial<ApprovalRuleNode>) =>
    setForm(f => ({ ...f, nodes: f.nodes.map((n, idx) => (idx === i ? { ...n, ...patch } : n)) }));

  const addNode = () =>
    setForm(f => ({
      ...f,
      nodes: [...f.nodes, { step_order: f.nodes.length + 1, approver_type: "role", approver_role: "admin", required_count: 1 }],
    }));

  const removeNode = (i: number) =>
    setForm(f => ({ ...f, nodes: f.nodes.filter((_, idx) => idx !== i).map((n, idx) => ({ ...n, step_order: idx + 1 })) }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "请填写规则名称", variant: "destructive" }); return;
    }
    if (!form.nodes.length) {
      toast({ title: "至少需要一个审批节点", variant: "destructive" }); return;
    }
    if (form.max_amount !== "" && Number(form.max_amount) <= Number(form.min_amount)) {
      toast({ title: "金额上限必须大于下限", variant: "destructive" }); return;
    }
    const bad = form.nodes.find(n => n.approver_type === "role" && !n.approver_role);
    if (bad) { toast({ title: "角色型节点必须选择角色", variant: "destructive" }); return; }

    const payload = {
      name: form.name.trim(),
      min_amount: Number(form.min_amount),
      max_amount: form.max_amount === "" ? null : Number(form.max_amount),
      amount_scope: form.amount_scope,
      priority: Number(form.priority),
      active: form.active,
      nodes: form.nodes.map((n, i) => ({
        step_order: i + 1,
        approver_type: n.approver_type,
        approver_role: n.approver_type === "role" ? n.approver_role : null,
        required_count: n.approver_type === "role" ? Number(n.required_count) || 1 : 1,
      })),
    };

    try {
      setIsSubmitting(true);
      if (editing) await updateApprovalRule(editing.id, payload);
      else await createApprovalRule(payload);
      toast({ title: editing ? "规则已更新" : "规则已创建" });
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast({ title: "保存失败", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await deleteApprovalRule(deletingId);
      toast({ title: "规则已删除" });
      await load();
    } catch (e) {
      toast({ title: "删除失败", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) return <LoadingState title="正在加载审批规则" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          按金额区间匹配审批链。<strong>单日累计</strong>指该部门主管当天已审批通过的金额合计加上本次金额，
          相当于给主管设定每日审批权限上限，超出则本单升级到更高一级审批。
        </p>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />新增规则
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState title="暂无审批规则" description="没有匹配的规则时申请将无法提交，请先新增规则" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>规则名称</TableHead>
              <TableHead>金额区间</TableHead>
              <TableHead>计算口径</TableHead>
              <TableHead>审批链</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{formatRange(r.min_amount, r.max_amount)}</TableCell>
                <TableCell>
                  <Badge variant={r.amount_scope === "daily" ? "default" : "secondary"}>
                    {r.amount_scope === "daily" ? "主管单日累计" : "单笔金额"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{describeNodes(r.nodes)}</TableCell>
                <TableCell>
                  {r.active ? <Badge variant="outline">启用</Badge>
                            : <Badge variant="secondary">停用</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="编辑">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeletingId(r.id)} aria-label="删除">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑审批规则" : "新增审批规则"}</DialogTitle>
            <DialogDescription>金额区间为左闭右开：下限含、上限不含。上限留空表示无上限。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>规则名称</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                     placeholder="例如：小额（部门主管）" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>金额下限（含）</Label>
                <Input type="number" min={0} value={form.min_amount}
                       onChange={e => setForm(f => ({ ...f, min_amount: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>金额上限（不含，留空为无上限）</Label>
                <Input type="number" min={0} value={form.max_amount}
                       onChange={e => setForm(f => ({ ...f, max_amount: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>计算口径</Label>
                <Select value={form.amount_scope}
                        onValueChange={(v: "daily" | "single") => setForm(f => ({ ...f, amount_scope: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">主管单日审批累计</SelectItem>
                    <SelectItem value="single">单笔金额</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>优先级（小的先匹配）</Label>
                <Input type="number" value={form.priority}
                       onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>启用该规则</Label>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">审批链（按顺序串行，节点内多人会签）</Label>
                <Button type="button" variant="outline" size="sm" onClick={addNode}>
                  <Plus className="mr-1 h-3 w-3" />加一级
                </Button>
              </div>

              {form.nodes.map((n, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border p-3">
                  <span className="text-sm text-muted-foreground shrink-0">第{i + 1}级</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />

                  <Select value={n.approver_type}
                          onValueChange={(v: "applicant_dept_manager" | "role") =>
                            setNode(i, { approver_type: v, approver_role: v === "role" ? "admin" : null, required_count: 1 })}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applicant_dept_manager">申请人部门主管</SelectItem>
                      <SelectItem value="role">按角色</SelectItem>
                    </SelectContent>
                  </Select>

                  {n.approver_type === "role" && (
                    <>
                      <Select value={n.approver_role ?? "admin"}
                              onValueChange={v => setNode(i, { approver_role: v })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Input type="number" min={1} className="w-20" value={n.required_count}
                               onChange={e => setNode(i, { required_count: Math.max(1, Number(e.target.value)) })} />
                        <span className="text-sm text-muted-foreground shrink-0">人会签</span>
                      </div>
                    </>
                  )}

                  {form.nodes.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="ml-auto"
                            onClick={() => removeNode(i)} aria-label="移除该级">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                部门主管由申请人所属部门决定；该部门未任命主管时申请将无法提交。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={submit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={o => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该审批规则？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后落在该金额区间的申请将找不到规则而无法提交，请确认已有其他规则覆盖。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApprovalRuleManager;
