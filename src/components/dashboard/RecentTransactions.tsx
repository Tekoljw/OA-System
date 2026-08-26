
import React from "react";
import { cn } from "@/lib/utils";

type TransactionStatus = "completed" | "pending" | "approved" | "rejected";

interface Transaction {
  id: string;
  description: string;
  amount: string;
  currency: string;
  account: string;
  date: string;
  status: TransactionStatus;
}

interface RecentTransactionsProps {
  transactions: Transaction[];
  className?: string;
}

const statusLabels: Record<TransactionStatus, string> = {
  completed: "已完成",
  pending: "待处理",
  approved: "已审批",
  rejected: "已拒绝",
};

const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  className,
}) => {
  return (
    <div
      className={cn(
        "bg-card rounded-lg border border-border shadow-sm",
        className
      )}
    >
      <div className="p-6">
        <h3 className="text-lg font-semibold">最近交易</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary border-y border-border">
            <tr>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-6">
                描述
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-6">
                金额
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-6">
                账户
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-6">
                日期
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-6">
                状态
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="hover:bg-secondary/50 transition-colors"
              >
                <td className="py-4 px-6">
                  <div className="font-medium">{transaction.description}</div>
                </td>
                <td className="py-4 px-6">
                  <div className="font-medium">
                    {transaction.amount} {transaction.currency}
                  </div>
                </td>
                <td className="py-4 px-6">{transaction.account}</td>
                <td className="py-4 px-6">{transaction.date}</td>
                <td className="py-4 px-6">
                  <span
                    className={cn(
                      "badge-" + transaction.status
                    )}
                  >
                    {statusLabels[transaction.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-border">
        <button className="text-primary hover:underline text-sm font-medium">
          查看全部交易
        </button>
      </div>
    </div>
  );
};

export default RecentTransactions;
