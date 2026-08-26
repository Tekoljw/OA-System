import React from "react";
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

const LOAN_TYPES = [
  { id: "1", name: "应收款", description: "他人或其他组织应付予我方的债务" },
  { id: "2", name: "预收款", description: "预先收取的与服务或产品相关的款项" },
  { id: "3", name: "应付款", description: "我方应付予他人或其他组织的债务" },
  { id: "4", name: "预付款", description: "预先支付的与服务或产品相关的款项" },
  { id: "5", name: "押金", description: "为担保某种行为或物品而缴纳的一定数额的金钱" },
  { id: "6", name: "借出", description: "借给他人或其他组织的资金" },
  { id: "7", name: "借入", description: "从他人或其他组织借入的资金" }
];

const LoanTypeManager = () => {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Button size="sm" disabled>
          <Plus className="h-4 w-4 mr-2" />
          系统分类
        </Button>
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
              <Card key={type.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{type.name}</h4>
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
                  <TableHead>描述</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LOAN_TYPES.map(type => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
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