import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface DepartmentCostAnalysisProps {
  className?: string;
}

// 饼图的颜色
const COLORS = ['#FF8042', '#0088FE', '#00C49F', '#FFBB28', '#8884d8', '#82ca9d'];

// 模拟部门成本数据
const DEPARTMENT_DATA = {
  "本月": [
    { name: "销售部", value: 85000 },
    { name: "研发部", value: 130000 },
    { name: "市场部", value: 60000 },
    { name: "行政部", value: 40000 },
    { name: "财务部", value: 35000 }
  ],
  "上月": [
    { name: "销售部", value: 80000 },
    { name: "研发部", value: 125000 },
    { name: "市场部", value: 65000 },
    { name: "行政部", value: 38000 },
    { name: "财务部", value: 32000 }
  ],
  "上上月": [
    { name: "销售部", value: 75000 },
    { name: "研发部", value: 120000 },
    { name: "市场部", value: 70000 },
    { name: "行政部", value: 35000 },
    { name: "财务部", value: 30000 }
  ],
  "今年": [
    { name: "销售部", value: 320000 },
    { name: "研发部", value: 450000 },
    { name: "市场部", value: 250000 },
    { name: "行政部", value: 180000 },
    { name: "财务部", value: 120000 }
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

const DepartmentCostAnalysis: React.FC<DepartmentCostAnalysisProps> = ({ className }) => {
  const [timeRange, setTimeRange] = useState<"本月" | "上月" | "上上月" | "今年">("本月");
  const data = DEPARTMENT_DATA[timeRange];
  
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={cn("bg-card p-6 rounded-lg border border-border shadow-sm", className)}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold">部门成本分析</h3>
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

export default DepartmentCostAnalysis;