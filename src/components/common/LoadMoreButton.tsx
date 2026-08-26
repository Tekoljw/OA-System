
import React from "react";
import { Button } from "../../components/ui/button";
import { Loader } from "lucide-react";
import { cn } from "../../lib/utils";

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  className?: string;
}

const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({
  onClick,
  isLoading = false,
  className
}) => {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        "w-full mt-4 md:w-auto md:mx-auto",
        isLoading && "opacity-70",
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader className="mr-2 h-4 w-4 animate-spin" />
          加载中...
        </>
      ) : (
        "加载更多"
      )}
    </Button>
  );
};

export default LoadMoreButton;
