
import {
  CreditCard,
  ArrowDownUp,
  BarChart3,
  FolderClosed,
  Users,
  Settings,
  ListChecks,
  FileText,
  DollarSign,
  Banknote,
  Wallet,
  ChartPie,
  UserCog,
  User,
  RefreshCw,
  PieChart,
} from "lucide-react";
import { MenuItem } from "@/types/menu";

export const menuItems: MenuItem[] = [
  {
    title: "财务仪表盘",
    path: "/",
    icon: DollarSign,
  },
  {
    title: "账户管理",
    path: "/accounts",
    icon: CreditCard,
  },
  {
    title: "流水管理",
    path: "/transactions",
    icon: ArrowDownUp,
    submenu: [
      { title: "出入金记录", path: "/transactions/external", icon: Banknote },
      { title: "内部划款记录", path: "/transactions/internal", icon: Wallet },
    ],
  },
  {
    title: "资产管理",
    path: "/assets",
    icon: BarChart3,
    submenu: [
      { title: "资产记录", path: "/assets/records", icon: ChartPie },
      { title: "借贷记录", path: "/assets/loans", icon: Wallet },
    ],
  },
  {
    title: "流程管理",
    path: "/workflows",
    icon: ListChecks,
    submenu: [
      { title: "我的申请", path: "/workflows/my-applications", icon: FileText },
      { title: "待审批", path: "/workflows/pending-approvals", icon: FileText },
      { title: "待归帐", path: "/workflows/pending-accounting", icon: Wallet },
      { title: "待执行", path: "/workflows/pending-execution", icon: ListChecks },
    ],
  },
  {
    title: "配置管理",
    path: "/configurations",
    icon: Settings,
    submenu: [
      { title: "账户配置", path: "/configurations/account-categories", icon: CreditCard },
      { title: "资产分类", path: "/configurations/asset-categories", icon: ChartPie },
      { title: "科目分类", path: "/configurations/subject-categories", icon: FolderClosed },
      { title: "流水类型", path: "/configurations/transaction-types", icon: ArrowDownUp },
    ],
  },
  {
    title: "股东管理",
    path: "/shareholders",
    icon: PieChart,
  },
  {
    title: "人员管理",
    path: "/personnel",
    icon: Users,
    submenu: [
      { title: "部门配置", path: "/personnel/departments", icon: Users },
      { title: "权限管理", path: "/personnel/permissions", icon: UserCog },
      { title: "用户管理", path: "/personnel/users", icon: User },
      { title: "操作日志", path: "/personnel/activity-logs", icon: FileText },
    ],
  },
];
