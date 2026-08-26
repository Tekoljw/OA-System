import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface ErrorStateProps {
  /**
   * 错误信息
   */
  error: string | null;
  
  /**
   * 重试函数
   */
  onRetry?: () => void;
  
  /**
   * 是否在卡片中显示
   */
  withCard?: boolean;
}

/**
 * 通用错误状态组件 - 在加载失败时显示错误信息
 */
const ErrorState = ({
  error,
  onRetry,
  withCard = true
}: ErrorStateProps) => {
  const { t } = useTranslation();
  
  const content = (
    <div className="text-center py-8">
      <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
      <div className="text-lg font-medium text-destructive">
        {error}
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        {t('common.checkNetworkAndTryAgain')}
      </p>
      <Button 
        variant="outline" 
        className="mt-4"
        onClick={onRetry || (() => window.location.reload())}
      >
        {t('common.reload')}
      </Button>
    </div>
  );
  
  if (withCard) {
    return <Card className="p-6">{content}</Card>;
  }
  
  return content;
};

export default ErrorState;