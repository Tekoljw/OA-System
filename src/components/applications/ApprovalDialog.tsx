import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "../../hooks/use-toast";

interface ApprovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: number;
  applicationTitle: string;
  onApprove: (id: number, comment: string) => Promise<void>;
  onReject: (id: number, comment: string) => Promise<void>;
}

const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  isOpen,
  onClose,
  applicationId,
  applicationTitle,
  onApprove,
  onReject,
}) => {
  const [comment, setComment] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleApprove = async () => {
    try {
      setIsLoading(true);
      await onApprove(applicationId, comment);
      toast({
        title: "审批成功",
        // 多级审批下，本级通过后整单可能仍在等下一级会签，
        // 写死「已转待归账」会让人以为流程走完了
        description: "本级审批已通过",
      });
      setComment("");
      onClose();
    } catch (error: any) {
      toast({
        title: "审批失败",
        // 服务端会说明具体原因（轮不到你审、状态不对、部门无主管……），
        // 一律吞成「请稍后重试」的话，用户只能反复重试而不知道错在哪
        description: error?.message || "操作出错，请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsLoading(true);
      await onReject(applicationId, comment);
      toast({
        title: "已拒绝申请",
        description: "申请已被拒绝",
      });
      setIsRejectDialogOpen(false);
      setComment("");
      onClose();
    } catch (error: any) {
      toast({
        title: "操作失败",
        description: error?.message || "拒绝申请失败，请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>审批申请</DialogTitle>
            <DialogDescription>
              您正在审批申请：{applicationTitle || `APP-${applicationId.toString().padStart(4, '0')}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">审批意见</label>
              <Textarea
                placeholder="请输入审批意见（可选）"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => setIsRejectDialogOpen(true)} disabled={isLoading}>
              <XCircle className="mr-2 h-4 w-4" />
              拒绝
            </Button>
            <Button onClick={handleApprove} disabled={isLoading}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              通过
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isRejectDialogOpen}
        onOpenChange={setIsRejectDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认拒绝</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要拒绝该申请吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReject();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isLoading}
            >
              确认拒绝
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ApprovalDialog;