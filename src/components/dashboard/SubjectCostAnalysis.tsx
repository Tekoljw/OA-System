import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface SubjectCostAnalysisProps {
  className?: string;
}

// 饼图的颜色
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

// 模拟科目成本数据
const SUBJECT_DATA = {
  "本月": [
    { name: "人力成本", value: 120000 },
    { name: "办公用品", value: 15000 },
    { name: "市场费用", value: 60000 },
    { name: "研发投入", value: 80000 },
    { name: "运营支出", value: 45000 }
  ],
  "上月": [
    { name: "人力成本", value: 110000 },
    { name: "办公用品", value: 18000 },
    { name: "市场费用", value: 70000 },
    { name: "研发投入", value: 75000 },
    { name: "运营支出", value: 40000 }
  ],
  "上上月": [
    { name: "人力成本", value: 105000 },
    { name: "办公用品", value: 20000 },
    { name: "市场费用", value: 50000 },
    { name: "研发投入", value: 90000 },
    { name: "运营支出", value: 35000 }
  ],
  "今年": [
    { name: "人力成本", value: 450000 },
    { name: "办公用品", value: 65000 },
    { name: "市场费用", value: 180000 },
    { name: "研发投入", value: 320000 },
    { name: "运营支出", value: 150000 }
  ]
};

// 格式化数字为金额
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0
  }).format(value);
};

const SubjectCostAnalysis: React.FC<SubjectCostAnalysisProps> = ({ className }) => {
  const [timeRange, setTimeRange] = useState<"本月" | "上月" | "上上月" | "今年">("本月");
  const data = SUBJECT_DATA[timeRange];
  
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
      </div>
      
      <div className="mt-4 text-center text-sm text-muted-foreground">
        <p>总支出: {formatCurrency(total)}</p>
      </div>
    </div>
  );
};

export default SubjectCostAnalysis;