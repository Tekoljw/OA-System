
export type LoanType = '应收款' | '预收款' | '应付款' | '预付款' | '押金' | '借出' | '借入';
export type LoanStatus = '待审批' | '已审批' | '已驳回' | '已完成';

export interface LoanSettlement {
  id: string;
  amount: number;
  description: string;
  settledAt: string;
  settledBy: string;
}

export interface Loan {
  id: string;
  currency: string;
  direction: '借出' | '借入';
  type: LoanType;
  department: string;
  description: string;
  submitter: string;
  approver: string;
  operationTime: string;
  amount: number;
  remainingAmount: number;
  status: LoanStatus;
  settlements: LoanSettlement[];
  borrower?: string; // 添加借款对象字段
  repaymentDate?: string; // 添加预计还款日期字段
}
