import React, { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  TransactionTypeDef, LoanTypeDef,
  getLoanTypeDefs, getSubjectsOfType, getOpenLoans, getOpenAssets,
} from "../../utils/transaction-types-api";
import { getAssetTypes, AssetType } from "../../utils/config-api";
import { apiRequest } from "../../api/client";

export interface SecondLevelValue {
  subjectId?: string;
  loanTypeCode?: string;
  relatedLoanId?: string;
  assetTypeId?: string;
  relatedAssetId?: string;
  shareholderId?: string;
  quantity?: string;
}

interface Props {
  type: TransactionTypeDef;
  value: SecondLevelValue;
  onChange: (patch: SecondLevelValue) => void;
  /** 选中的销账/出售目标的可用上限，用于提示金额不能超 */
  onLimitChange?: (limit: number | null) => void;
}

interface Option { id: string; name: string; limit?: number }

/**
 * 二级选项。
 * 选什么完全由一级类型的 second_level 决定，前端不自行判断业务，
 * 加一种流水类型时这里不用改。
 */
const SecondLevelPicker = ({ type, value, onChange, onLimitChange }: Props) => {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        let opts: Option[] = [];
        switch (type.second_level) {
          case 'subject':
            opts = (await getSubjectsOfType(type.code)).map(s => ({ id: s.id, name: s.name }));
            break;
          case 'loan_type': {
            const lts: LoanTypeDef[] = await getLoanTypeDefs(type.loan_direction || undefined);
            opts = lts.map(l => ({ id: l.code, name: l.name }));
            break;
          }
          case 'loan':
            opts = (await getOpenLoans(type.loan_direction || 'lend'))
              .map(l => ({ id: l.id, name: l.label, limit: l.remainingAmount }));
            break;
          case 'asset_type':
            opts = ((await getAssetTypes()) as AssetType[]).map(a => ({ id: String(a.id), name: a.name }));
            break;
          case 'asset':
            opts = (await getOpenAssets()).map(a => ({ id: a.id, name: a.label, limit: a.remainingValue }));
            break;
          case 'shareholder': {
            const r: any = await apiRequest('GET', '/api/shareholders');
            const list = r?.data?.shareholders || r?.data || [];
            opts = (Array.isArray(list) ? list : []).map((s: any) => ({ id: String(s.id), name: s.name }));
            break;
          }
        }
        if (!cancelled) setOptions(opts);
      } catch (e) {
        console.error('加载二级选项失败:', e);
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [type.code, type.second_level, type.loan_direction]);

  const label = {
    subject:     '科目',
    loan_type:   type.loan_direction === 'lend' ? '借出类型' : '借入类型',
    loan:        '要销账的借贷记录',
    asset_type:  '资产分类',
    asset:       '要出售的资产',
    shareholder: '股东',
  }[type.second_level];

  const currentId = {
    subject:     value.subjectId,
    loan_type:   value.loanTypeCode,
    loan:        value.relatedLoanId,
    asset_type:  value.assetTypeId,
    asset:       value.relatedAssetId,
    shareholder: value.shareholderId,
  }[type.second_level] || '';

  const handlePick = (id: string) => {
    const picked = options.find(o => o.id === id);
    onLimitChange?.(picked?.limit ?? null);
    switch (type.second_level) {
      case 'subject':     onChange({ subjectId: id }); break;
      case 'loan_type':   onChange({ loanTypeCode: id }); break;
      case 'loan':        onChange({ relatedLoanId: id }); break;
      case 'asset_type':  onChange({ assetTypeId: id }); break;
      case 'asset':       onChange({ relatedAssetId: id }); break;
      case 'shareholder': onChange({ shareholderId: id }); break;
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">{label}</label>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
            <Loader2 className="h-4 w-4 animate-spin" />加载中…
          </div>
        ) : options.length === 0 ? (
          // 空池子必须说清楚为什么，否则用户只看到一个选不动的下拉框
          <div className="flex items-start gap-2 text-sm text-destructive border rounded-md p-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {type.second_level === 'loan'
                ? '没有未结清的借贷记录可销账'
                : type.second_level === 'asset'
                ? '没有仍有账面价值的资产可出售'
                : type.second_level === 'shareholder'
                ? '还没有股东，请先在股东管理中添加'
                : `「${type.name}」下还没有可选项，请先在配置管理中添加`}
            </span>
          </div>
        ) : (
          <Select value={currentId} onValueChange={handlePick}>
            <SelectTrigger><SelectValue placeholder={`请选择${label}`} /></SelectTrigger>
            <SelectContent>
              {options.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 购买资产要记数量，将来报损/出售才知道一批里处置了多少 */}
      {type.derives === 'asset_new' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">数量</label>
          <Input
            type="number" min={1}
            value={value.quantity ?? '1'}
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

export default SecondLevelPicker;
