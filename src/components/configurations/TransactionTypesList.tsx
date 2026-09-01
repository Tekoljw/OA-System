import React, { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { useIsMobile } from "../../hooks/use-mobile";
import { ArrowDownIcon, ArrowUpIcon, Loader2, HelpCircle, Lock } from "lucide-react";
import { TransactionTypeDef, getTransactionTypeDefs } from "../../utils/transaction-types-api";

/** 二级选项从哪里来 */
const SECOND_LEVEL_LABEL: Record<string, string> = {
  subject:     '科目（可自建）',
  loan_type:   '借贷分类（固定）',
  loan:        '具体借贷记录',
  asset_type:  '资产分类（可自建）',
  asset:       '具体资产记录',
  shareholder: '股东',
};

/** 落账后会在别处留下什么 */
const DERIVES_LABEL: Record<string, { text: string; tone: 'none' | 'new' | 'settle' }> = {
  none:          { text: '不衍生',           tone: 'none' },
  loan_new:      { text: '新建借贷记录',     tone: 'new' },
  loan_settle:   { text: '冲减借贷记录',     tone: 'settle' },
  asset_new:     { text: '新建资产记录',     tone: 'new' },
  asset_dispose: { text: '冲减资产账面价值', tone: 'settle' },
  shareholder:   { text: '记入股东往来',     tone: 'new' },
};

/**
 * 流水类型总览。
 * 类型由系统固定，这里只做说明：让人看清选了某个类型之后，
 * 二级要选什么、落账后会在资产或借贷里留下什么。
 */
const TransactionTypesList = () => {
  const isMobile = useIsMobile();
  const [types, setTypes] = useState<TransactionTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTransactionTypeDefs()
      .then(setTypes)
      .catch(() => setError('获取流水类型失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <HelpCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const renderDerives = (d: string) => {
    const info = DERIVES_LABEL[d] ?? { text: d, tone: 'none' as const };
    if (info.tone === 'none') return <span className="text-muted-foreground">{info.text}</span>;
    return (
      <Badge variant={info.tone === 'new' ? 'default' : 'secondary'}>{info.text}</Badge>
    );
  };

  const renderGroup = (direction: 'income' | 'expense') => {
    const list = types.filter(t => t.direction === direction);
    const isIncome = direction === 'income';
    return (
      <div key={direction}>
        <div className="flex items-center gap-2 mb-4">
          {isIncome
            ? <ArrowUpIcon className="h-5 w-5 text-emerald-500" />
            : <ArrowDownIcon className="h-5 w-5 text-destructive" />}
          <h3 className="text-lg font-medium">{isIncome ? '收入' : '支出'}流水类型</h3>
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3" />系统固定
          </Badge>
        </div>

        <Card>
          <CardContent className={isMobile ? "p-4 space-y-3" : "p-0"}>
            {isMobile ? (
              list.map(t => (
                <div key={t.code} className="border rounded-md p-3 space-y-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-sm text-muted-foreground">二级：{SECOND_LEVEL_LABEL[t.second_level]}</div>
                  <div className="text-sm">{renderDerives(t.derives)}</div>
                </div>
              ))
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">流水类型</TableHead>
                    <TableHead className="w-[220px]">二级选什么</TableHead>
                    <TableHead>落账后</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(t => (
                    <TableRow key={t.code}>
                      <TableCell className="font-medium">
                        {t.name}
                        {/* 借贷相关的类型限定方向，选错方向后端会拒 */}
                        {t.loan_direction && (
                          <Badge variant="outline" className="ml-2">
                            {t.loan_direction === 'lend' ? '我们借出' : '我们借入'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {SECOND_LEVEL_LABEL[t.second_level] ?? t.second_level}
                      </TableCell>
                      <TableCell>{renderDerives(t.derives)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        流水类型由系统固定，不能增删改。提交申请时先选类型，二级选项和落账后的衍生记录都由它决定；
        只有「不衍生」的四种类型才可以在科目分类里自建二级科目。
      </p>
      {renderGroup('income')}
      {renderGroup('expense')}
    </div>
  );
};

export default TransactionTypesList;
