import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Plus, Edit, Trash2, Loader2, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { useToast } from "../../hooks/use-toast";
import { cn } from "../../lib/utils";
import { apiRequest } from "../../api/client";
import { TransactionTypeDef, getTransactionTypeDefs } from "../../utils/transaction-types-api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";

interface Subject {
  id: string;
  name: string;
  code?: string;
  description?: string;
  type: 'income' | 'expense';
  transaction_type_code: string;
  is_system: boolean;
}

/**
 * 科目池。
 *
 * 科目是流水的二级选项，按一级流水类型分池、各挂各的：
 * 选了「主营收入」就只能看到主营收入下的科目。
 * 只有不衍生其他记录的四个类型（主营/其他收入、营业/其他支出）才有科目池，
 * 衍生类的二级选项来自借贷分类、资产分类或股东列表，不在这里维护。
 */
const SubjectPoolManager = () => {
  const [pools, setPools] = useState<TransactionTypeDef[]>([]);
  const [activeCode, setActiveCode] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '' });
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const all = await getTransactionTypeDefs();
        const list = all.filter(t => t.second_level === 'subject');
        setPools(list);
        setActiveCode(prev => prev || list[0]?.code || '');
      } catch {
        toast({ variant: 'destructive', description: '加载流水类型失败' });
      }
    })();
  }, [toast]);

  const loadSubjects = async (code: string) => {
    if (!code) return;
    setLoading(true);
    try {
      const r = await apiRequest('GET', `/api/subjects?transactionTypeCode=${encodeURIComponent(code)}`);
      setSubjects(r.data || []);
    } catch {
      setSubjects([]);
      toast({ variant: 'destructive', description: '加载科目失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSubjects(activeCode); /* eslint-disable-next-line */ }, [activeCode]);

  const openAdd = () => { setEditing(null); setFormData({ name: '', code: '', description: '' }); setDialogOpen(true); };
  const openEdit = (s: Subject) => {
    setEditing(s);
    setFormData({ name: s.name, code: s.code || '', description: s.description || '' });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast({ variant: 'destructive', description: '科目名称不能为空' }); return; }
    setSubmitting(true);
    try {
      if (editing) {
        await apiRequest('PUT', `/api/subjects/${editing.id}`, {
          name: formData.name, code: formData.code, description: formData.description,
        });
        toast({ description: '科目已更新' });
      } else {
        // 收支方向由一级类型决定，不在这里让用户选，避免出现挂错方向的科目
        await apiRequest('POST', '/api/subjects', {
          name: formData.name, code: formData.code, description: formData.description,
          transaction_type_code: activeCode,
        });
        toast({ description: '科目已添加' });
      }
      setDialogOpen(false);
      await loadSubjects(activeCode);
    } catch (e: any) {
      toast({ variant: 'destructive', title: '保存失败', description: e?.message || '请稍后再试' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSubmitting(true);
    try {
      await apiRequest('DELETE', `/api/subjects/${deletingId}`);
      toast({ description: '科目已删除' });
      await loadSubjects(activeCode);
    } catch (e: any) {
      toast({ variant: 'destructive', title: '删除失败', description: e?.message || '请稍后再试' });
    } finally {
      setSubmitting(false);
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 一级类型页签＝科目池，各挂各的 */}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {pools.map(p => (
          <button
            key={p.code}
            type="button"
            onClick={() => setActiveCode(p.code)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm border transition-colors",
              p.code === activeCode ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button onClick={openAdd} disabled={!activeCode}>
          <Plus className="h-4 w-4 mr-2" />添加科目
        </Button>
        <p className="text-sm text-muted-foreground">
          衍生资产、借贷、股东记录的流水类型不在此维护，其二级选项来自各自的记录
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />加载中…
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">该类型下还没有科目</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>科目名称</TableHead>
                  <TableHead className="w-[140px]">编码</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead className="w-[110px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {s.name}
                        {s.is_system && (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="h-3 w-3" />系统
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{s.code || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.description || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {/* 系统科目不可改删：它们与固定流水类型绑定 */}
                        <Button variant="ghost" size="icon" disabled={s.is_system} onClick={() => openEdit(s)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={s.is_system} onClick={() => setDeletingId(s.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? '编辑科目' : `添加科目 — ${pools.find(p => p.code === activeCode)?.name || ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">科目名称</label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                     placeholder="如：用户充值、增值服务" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">编码（可选）</label>
              <Input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">说明</label>
              <Textarea rows={3} value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中…</> : (editing ? '更新' : '添加')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              已被流水引用的科目无法删除——删掉历史流水就失去归类，报表会对不上。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }}
                               disabled={submitting} className="bg-destructive hover:bg-destructive/90">
              {submitting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubjectPoolManager;
