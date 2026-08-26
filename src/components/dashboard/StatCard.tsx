
import React from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  change?: { value: number; isPositive: boolean };
  description?: string;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  change,
  description,
  className,
}) => {
  return (
    <div
      className={cn(
        "bg-card p-6 rounded-lg border border-border shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-semibold min-w-[180px]">{value}</p>
        {change && (
          <div className="flex items-center mt-2">
            <div
              className={cn(
                "flex items-center text-xs",
                change.isPositive ? "text-success" : "text-destructive"
              )}
            >
              {change.isPositive ? (
                <ArrowUp className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDown className="h-3 w-3 mr-1" />
              )}
              <span>{Math.abs(change.value)}%</span>
            </div>
            <span className="text-xs text-muted-foreground ml-1">相比上月</span>
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
