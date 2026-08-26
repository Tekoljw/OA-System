import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AccountManagementDialog } from "@/components/accounts/AccountManagementDialog";
import { Sidebar } from "@/components/ui/sidebar";
import Header from "@/components/layout/Header";

interface Account {
  id: string;
  username: string;
  fullName: string;
  role: string;
  bePayId?: string;
  notes?: string;
}

export default function AccountManagement() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([
    {
      id: "1",
      username: "admin",
      fullName: "System Administrator",
      role: "admin",
      bePayId: "BP001",
      notes: "Main administrator account",
    },
    {
      id: "2",
      username: "manager1",
      fullName: "Department Manager",
      role: "manager",
      bePayId: "BP002",
      notes: "Finance department manager",
    },
  ]);

  const handleDelete = (id: string) => {
    setAccounts(accounts.filter(account => account.id !== id));
    toast({
      description: "Account deleted successfully",
    });
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="relative">
          <Header title="账号管理" subtitle="管理系统用户账号和权限" />
          <div className="absolute top-4 right-4">
            <AccountManagementDialog />
          </div>
        </div>
        <main className="flex-1 overflow-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold">Account Management</h1>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>BePay ID</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>{account.username}</TableCell>
                    <TableCell>{account.fullName}</TableCell>
                    <TableCell className="capitalize">{account.role}</TableCell>
                    <TableCell>{account.bePayId || "-"}</TableCell>
                    <TableCell>{account.notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <AccountManagementDialog account={account} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(account.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </main>
      </div>
    </div>
  );
}
