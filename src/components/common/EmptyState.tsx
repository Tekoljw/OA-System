import React, { ReactNode } from "react";
import { FileQuestion } from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
  actionText?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ 
  title, 
  description,
  icon = <FileQuestion className="h-12 w-12" />,
  action,
  onAction,
  actionText = "添加"
}) => {
  return (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          {icon}
        </div>
        <div className="text-lg font-medium text-muted-foreground">
          {title}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-2">
            {description}
          </p>
        )}
        {action && (
          <div className="mt-4">
            {action}
          </div>
        )}
        {onAction && !action && (
          <Button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("EmptyState 按钮点击 - 调用 onAction");
              onAction();
            }} 
            className="mt-4"
          >
            {actionText}
          </Button>
        )}
      </div>
    </Card>
  );
};

export default EmptyState;