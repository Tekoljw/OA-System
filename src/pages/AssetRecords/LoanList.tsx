
import React from "react";
import { safeFormatCurrency } from "../../utils/formatter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import type { Loan } from "../../types/loan";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "../../components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { Receipt, ArrowLeft, ArrowRight, ClipboardList, Calendar, Users, BadgeDollarSign, Info, ShieldAlert } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { useIsMobile } from "../../hooks/use-mobile";
import { Separator } from "../../components/ui/separator";
import EmptyState from "../../components/common/EmptyState";

interface LoanListProps {
  loans: Loan[];
  onSettle: (loan: Loan) => void;
  /** 手工销账只有会计能做，其他角色仍可查看记录 */
  canSettle?: boolean;
  /** 删除借贷记录走资产管理权限 */
  canDelete?: boolean;
  onDelete: (loan: Loan) => void;
}

export function LoanList({ loans, onSettle, onDelete, canSettle = true, canDelete = true }: LoanListProps) {
  const isMobile = useIsMobile();

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "待审批":
        return "bg-yellow-100 text-yellow-800";
      case "已审批":
        return "bg-green-100 text-green-800";
      case "已驳回":
        return "bg-red-100 text-red-800";
      case "已完成":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getDirectionColor = (direction: string): string => {
    return direction === "借出" 
      ? "bg-blue-100 text-blue-800"
      : "bg-indigo-100 text-indigo-800";
  };

  if (isMobile) {
    return (
      <div className="grid gap-4">
        {loans.map((loan) => (
          <Card key={loan.id} className="overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base font-medium">{loan.description}</CardTitle>
                  <div className="text-sm text-muted-foreground mt-1">ID: {loan.id}</div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className={getDirectionColor(loan.direction)}>
                    {loan.direction}
                  </Badge>
                  <Badge variant="outline" className={getStatusColor(loan.status)}>
                    {loan.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 pb-2">
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <BadgeDollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {loan.amount} {loan.currency}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{loan.operationTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{loan.department}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{loan.type}</span>
                </div>
              </div>

              {/* 添加借款对象和预计还款日期 */}
              {loan.borrower && (
                <div className="mt-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">借款对象:</span>
                    <span className="text-sm">{loan.borrower}</span>
                  </div>
                </div>
              )}
              {loan.repaymentDate && (
                <div className="mt-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">预计还款日期:</span>
                    <span className="text-sm">{loan.repaymentDate}</span>
                  </div>
                </div>
              )}
              
              <div className="mt-4 pt-2 border-t">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">销账记录</span>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 gap-1">
                        查看
                        {loan.settlements.length > 0 && (
                          <Badge variant="secondary" className="ml-1.5 px-1.5 h-5">
                            {loan.settlements.length}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0 max-h-[400px] overflow-y-auto">
                      <Card>
                        <CardContent className="p-4 space-y-2">
                          {loan.settlements.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-2">
                              暂无销账记录
                            </div>
                          ) : (
                            loan.settlements.map((settlement) => (
                              <div
                                key={settlement.id}
                                className="bg-secondary/40 rounded-lg p-3 space-y-1"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium">
                                    金额: {settlement.amount}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {settlement.settledAt}
                                  </span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  描述: {settlement.description}
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-4 pt-2 flex gap-2 justify-end border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSettle(loan)}
                disabled={loan.remainingAmount <= 0 || !canSettle}
                title={canSettle ? '手工销账（收不回 / 不打算还）' : '只有会计可以手工销账'}
              >
                手工销账
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!canDelete}
                    title={canDelete ? undefined : '没有资产管理权限，无法删除'}
                  >
                    删除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除</AlertDialogTitle>
                    <AlertDialogDescription>
                      您确定要删除此借贷记录吗？此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(loan)}>
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        ))}
        
        {loans.length === 0 && (
          <EmptyState 
            title="暂无借贷记录" 
            description="当有新的借贷记录时，将会显示在这里"
            icon={<Receipt className="h-12 w-12 text-muted-foreground opacity-50" />}
          />
        )}
      </div>
    );
  }

  // 格式化货币
  const formatCurrency = (amount: number, currency: string = "CNY") => {
    return safeFormatCurrency(amount, currency, 'zh-CN');
  };

  // 将使用内联的无数据展示而不是单独的组件

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-[80px]">币种</TableHead>
                <TableHead className="w-[100px]">借出/借入</TableHead>
                <TableHead className="w-[100px]">类型</TableHead>
                <TableHead className="w-[100px]">部门</TableHead>
                <TableHead className="min-w-[120px]">金额</TableHead>
                <TableHead className="min-w-[120px]">剩余金额</TableHead>
                <TableHead className="min-w-[120px]">借款对象</TableHead>
                <TableHead className="min-w-[120px]">预计还款日期</TableHead>
                <TableHead className="min-w-[120px]">操作时间</TableHead>
                <TableHead className="w-[100px]">状态</TableHead>
                <TableHead className="w-[80px]">销账记录</TableHead>
                <TableHead className="w-[180px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="h-24 text-center">
                    <div className="flex justify-center items-center h-full">
                      <div className="flex flex-col items-center">
                        <Receipt className="h-8 w-8 text-muted-foreground opacity-50 mb-2" />
                        <span className="text-muted-foreground">暂无借贷记录</span>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : loans.map((loan) => (
                <TableRow key={loan.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{loan.id}</TableCell>
                  <TableCell>{loan.description}</TableCell>
                  <TableCell>{loan.currency}</TableCell>
                  <TableCell>
                    <Badge className={getDirectionColor(loan.direction)}>
                      {loan.direction}
                    </Badge>
                  </TableCell>
                  <TableCell>{loan.type}</TableCell>
                  <TableCell>{loan.department}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(loan.amount, loan.currency)}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(loan.remainingAmount, loan.currency)}
                  </TableCell>
                  <TableCell>{loan.borrower || "-"}</TableCell>
                  <TableCell>{loan.repaymentDate || "-"}</TableCell>
                  <TableCell>{loan.operationTime}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(loan.status)}>
                      {loan.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="w-8 h-8 p-0"
                        >
                          <Receipt className="h-4 w-4" />
                          {loan.settlements.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary/10 text-primary px-1 rounded-full text-xs">
                              {loan.settlements.length}
                            </span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0 max-h-[400px] overflow-y-auto">
                        <Card>
                          <CardHeader className="py-3 px-4">
                            <CardTitle className="text-sm font-medium">销账记录</CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 space-y-3">
                            {loan.settlements.length === 0 ? (
                              <div className="text-sm text-muted-foreground text-center py-2">
                                暂无销账记录
                              </div>
                            ) : (
                              loan.settlements.map((settlement) => (
                                <div
                                  key={settlement.id}
                                  className="bg-secondary/40 rounded-lg p-3 space-y-2"
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium">
                                      金额: {formatCurrency(settlement.amount, loan.currency)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {settlement.settledAt}
                                    </span>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    描述: {settlement.description}
                                  </div>
                                </div>
                              ))
                            )}
                          </CardContent>
                        </Card>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSettle(loan)}
                        disabled={loan.remainingAmount <= 0 || !canSettle}
                        title={canSettle ? '手工销账（收不回 / 不打算还）' : '只有会计可以手工销账'}
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        手工销账
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canDelete}
                            title={canDelete ? undefined : '没有资产管理权限，无法删除'}
                          >
                            <ShieldAlert className="h-4 w-4 mr-1" />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              您确定要删除此借贷记录吗？此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(loan)}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
