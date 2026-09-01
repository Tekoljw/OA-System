import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Plus, FileQuestion } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Card, CardContent } from "../ui/card";
import { useIsMobile } from "../../hooks/use-mobile";
import EmptyState from "../common/EmptyState";
import { Badge } from "../ui/badge";
import { Loader2 } from "lucide-react";
import { LoanTypeDef, getLoanTypeDefs } from "../../utils/transaction-types-api";

/**
 * 借贷分类：系统固定，只读。
 * 原先在前端写死一份，与后端各说各话；现在一律从后端取，
 * 增减类型只需改数据库，界面自动跟随。
 */
const LoanTypeManager = () => {
  const isMobile = useIsMobile();
  const [LOAN_TYPES, setLoanTypes] = useState<LoanTypeDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLoanTypeDefs()
      .then(setLoanTypes)
      .catch(() => setLoanTypes([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />加载中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" disabled>
          <Plus className="h-4 w-4 mr-2" />
          系统分类
        </Button>
        <p className="text-sm text-muted-foreground">
          借贷分类由系统固定，不可增删改；「借出」表示钱在外面别人欠我们，「借入」表示我们欠别人
        </p>
      </div>

      {LOAN_TYPES.length === 0 ? (
        <EmptyState 
          title="暂无借贷分类数据" 
          description="系统预设的借贷分类将在此显示"
          icon={<FileQuestion className="h-12 w-12" />}
        />
      ) : (
        isMobile ? (
          <div className="space-y-4">
            {LOAN_TYPES.map(type => (
              <Card key={type.code} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        {type.name}
                        <Badge variant={type.direction === 'lend' ? 'default' : 'secondary'}>
                          {type.direction === 'lend' ? '借出' : '借入'}
                        </Badge>
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead className="w-[120px]">方向</TableHead>
                  <TableHead>描述</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LOAN_TYPES.map(type => (
                  <TableRow key={type.code}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell>
                      <Badge variant={type.direction === 'lend' ? 'default' : 'secondary'}>
                        {type.direction === 'lend' ? '我们借出' : '我们借入'}
                      </Badge>
                    </TableCell>
                    <TableCell>{type.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
};

export default LoanTypeManager;