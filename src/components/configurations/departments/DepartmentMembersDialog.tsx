
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, User, UserPlus, UserMinus, ArrowRight } from "lucide-react";

interface Member {
  id: number;
  name: string;
  role: string;
}

interface DepartmentMembersDialogProps {
  department: {
    id: number;
    name: string;
  };
}

export function DepartmentMembersDialog({ department }: DepartmentMembersDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [members] = useState<Member[]>([
    { id: 1, name: "张三", role: "主管" },
    { id: 2, name: "李四", role: "员工" },
    { id: 3, name: "王五", role: "员工" },
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" />
      </Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{department.name} - 部门成员管理</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end space-x-2 mb-4">
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            添加成员
          </Button>
          <Button>
            <ArrowRight className="mr-2 h-4 w-4" />
            调动成员
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>职务</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.name}</TableCell>
                <TableCell>{member.role}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon">
                      <User className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
