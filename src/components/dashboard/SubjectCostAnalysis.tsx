import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { fetchExpenseBySubject } from "../../utils/dashboard-api";

interface SubjectCostAnalysisProps {
  className?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0
  }).format(value);
};

const SubjectCostAnalysis: React.FC<SubjectCostAnalysisProps> = ({ className }) => {
  const [timeRange, setTimeRange] = useState<"本月" | "上月" | "上上月" | "今年">("本月");
  const [data, setData] = useState<{ name: string; value: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const result = await fetchExpenseBySubject();
        const items = result?.data || result || [];
        setData(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("获取科目成本数据失败:", error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [timeRange]);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={cn("bg-card p-6 rounded-lg border border-border shadow-sm", className)}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold">科目成本分析</h3>
        <Select
          value={timeRange}
          onValueChange={(value: "本月" | "上月" | "上上月" | "今年") => setTimeRange(value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="选择时间范围" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="本月">本月</SelectItem>
            <SelectItem value="上月">上月</SelectItem>
            <SelectItem value="上上月">上上月</SelectItem>
            <SelectItem value="今年">今年</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="h-[250px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">加载中...</div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={true}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        <p>总支出: {formatCurrency(total)}</p>
      </div>
    </div>
  );
};

export default SubjectCostAnalysis;
