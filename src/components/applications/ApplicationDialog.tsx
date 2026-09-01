import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, FilePlus } from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import ImageUploader from "../common/ImageUploader";
import { getDepartments, Department } from "../../utils/departments-api";
import { useAuth } from "../../contexts/AuthContext";
import { TransactionTypeDef, getTransactionTypeDefs } from "../../utils/transaction-types-api";
import SecondLevelPicker, { SecondLevelValue } from "./SecondLevelPicker";
import { cn } from "../../lib/utils";

/**
 * 申请单弹窗。
 *
 * 顶部先选一级流水类型（系统固定），二级选项和衍生行为都由它决定：
 *   主营/其他收入支出 → 选科目，不衍生
 *   贷入收入/借款支出 → 选借贷分类，落账后新建借贷记录
 *   还款收入/还款支出 → 选具体借贷记录，落账后冲减
 *   购买资产支出      → 选资产分类 + 数量，落账后新建资产记录
 *   出售资产收入      → 选具体资产，落账后冲减账面价值
 *   股东入资/分红     → 选股东
 * 校验以后端为准，这里只做即时反馈，避免让人走完审批链才知道填错。
 */
export interface ApplicationSubmitData {
  title: string;
  amount: string;
  department: string;
  description?: string;
  images: string[];
  relatedParty?: string;
  dueDate?: string;
  transactionTypeCode: string;
  direction: 'income' | 'expense';
  loanTypeCode?: string;
  relatedLoanId?: string;
  relatedAssetId?: string;
  assetTypeId?: string;
  subjectId?: string;
  shareholderId?: string;
  quantity?: string;
}

interface ApplicationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ApplicationSubmitData) => Promise<void> | void;
  /** 收款类申请只列收入类型，付款类只列支出类型 */
  presetType?: 'payment' | 'income' | 'purchase' | 'sales' | 'borrowing' | 'lending';
}

const INCOME_PRESETS = ['income', 'sales', 'borrowing'];

export function ApplicationDialog({ isOpen, onClose, onSubmit, presetType }: ApplicationDialogProps) {
  const direction: 'income' | 'expense' =
    presetType && INCOME_PRESETS.includes(presetType) ? 'income' : 'expense';

  const [types, setTypes] = useState<TransactionTypeDef[]>([]);
  const [activeCode, setActiveCode] = useState<string>('');
  const [second, setSecond] = useState<SecondLevelValue>({ quantity: '1' });
  const [limit, setLimit] = useState<number | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState({ title: '', amount: '', department: '', description: '', relatedParty: '', dueDate: '' });
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const activeType = useMemo(() => types.find(t => t.code === activeCode), [types, activeCode]);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingTypes(true);
    getTransactionTypeDefs(direction)
      .then(list => {
        setTypes(list);
        setActiveCode(prev => prev || list[0]?.code || '');
      })
      .catch(() => toast({ variant: 'destructive', description: '加载流水类型失败' }))
      .finally(() => setLoadingTypes(false));
  }, [isOpen, direction, toast]);

  useEffect(() => {
    if (!isOpen) return;
    getDepartments().then(r => {
      if (r.success && r.departments) {
        setDepartments(r.departments);
        setForm(f => f.department ? f : { ...f, department: String(user?.department || r.departments[0]?.id || '') });
      }
    }).catch(() => { /* 部门加载失败时下拉为空，提交会被后端拦下 */ });
  }, [isOpen, user]);

  // 换一级类型就要清掉二级选择：上一个类型的科目/记录对新类型没有意义
  const switchType = (code: string) => {
    setActiveCode(code);
    setSecond({ quantity: '1' });
    setLimit(null);
  };

  const reset = () => {
    setForm({ title: '', amount: '', department: '', description: '', relatedParty: '', dueDate: '' });
    setSecond({ quantity: '1' });
    setImages([]);
    setLimit(null);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!activeType) { toast({ variant: 'destructive', description: '请选择流水类型' }); return; }
    if (form.title.trim().length < 2) { toast({ variant: 'destructive', description: '标题至少 2 个字符' }); return; }
    const amount = Number(form.amount);
    if (!isFinite(amount) || amount <= 0) { toast({ variant: 'destructive', description: '金额必须大于 0' }); return; }
    if (!form.department) { toast({ variant: 'destructive', description: '请选择部门' }); return; }
    // 销账/出售不能超过剩余额度，后端也会挡，这里先给即时反馈
    if (limit !== null && amount > limit) {
      toast({ variant: 'destructive', description: `金额不能超过所选记录的剩余 ${limit.toFixed(2)}` });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        amount: form.amount,
        images,
        transactionTypeCode: activeType.code,
        direction,
        subjectId: second.subjectId,
        loanTypeCode: second.loanTypeCode,
        relatedLoanId: second.relatedLoanId,
        relatedAssetId: second.relatedAssetId,
        assetTypeId: second.assetTypeId,
        shareholderId: second.shareholderId,
        quantity: second.quantity,
      });
      toast({ description: '申请已提交' });
      reset();
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '提交失败', description: e?.message || '请稍后再试' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="h-5 w-5" />
            {direction === 'income' ? '收款申请' : '付款申请'}
          </DialogTitle>
        </DialogHeader>

        {/* 一级流水类型页签：系统固定，决定二级选项和衍生行为 */}
        {loadingTypes ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />加载流水类型…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {types.map(t => (
              <button
                key={t.code}
                type="button"
                onClick={() => switchType(t.code)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm border transition-colors",
                  t.code === activeCode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-secondary"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4 py-2">
          {activeType && (
            <SecondLevelPicker
              type={activeType}
              value={second}
              onChange={(patch) => setSecond(prev => ({ ...prev, ...patch }))}
              onLimitChange={setLimit}
            />
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">标题</label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                   placeholder="简述这笔申请" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">金额</label>
              <Input type="number" step="0.01" value={form.amount}
                     onChange={e => setForm({ ...form, amount: e.target.value })} />
              {limit !== null && (
                <p className="text-xs text-muted-foreground">所选记录剩余 {limit.toFixed(2)}，不能超过</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">申请部门</label>
              <Select value={form.department} onValueChange={v => setForm({ ...form, department: v })}>
                <SelectTrigger><SelectValue placeholder="请选择部门" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 新建借贷记录时要记清对方是谁、什么时候还，否则将来无从催收 */}
          {activeType?.derives === 'loan_new' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">对方</label>
                <Input value={form.relatedParty}
                       onChange={e => setForm({ ...form, relatedParty: e.target.value })}
                       placeholder="借款人 / 公司名称" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">约定还款日</label>
                <Input type="date" value={form.dueDate}
                       onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">备注</label>
            <Textarea rows={3} value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">附件</label>
            <ImageUploader
              multiple
              initialImages={images}
              onImageUpload={(file) => {
                const reader = new FileReader();
                reader.onload = e => setImages(prev => [...prev, e.target?.result as string]);
                reader.readAsDataURL(file);
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting || !activeType}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />提交中…</> : '提交申请'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ApplicationDialog;
