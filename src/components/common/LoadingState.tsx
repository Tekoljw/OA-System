import React from "react";
import { Loader2 } from "lucide-react";
import { Card } from "../ui/card";

export interface LoadingStateProps {
  title?: string;
  description?: string;
  text?: string; // 添加text属性以兼容现有使用
}

const LoadingState: React.FC<LoadingStateProps> = ({ 
  title, 
  description,
  text // 新增text参数
}) => {
  // 如果提供了text，则使用text作为title
  const displayTitle = text || title || "正在加载...";
  return (
    <Card className="p-6">
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
        </div>
        <div className="text-lg font-medium">
          {displayTitle}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-2">
            {description}
          </p>
        )}
      </div>
    </Card>
  );
};

export default LoadingState;