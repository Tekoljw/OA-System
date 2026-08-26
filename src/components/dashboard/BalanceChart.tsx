
import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

interface BalanceChartProps {
  className?: string;
}

// 月报数据 - 显示12个月的数据
const MONTHLY_DATA = [
  { name: "1月", 收入: 400000, 支出: 240000 },
  { name: "2月", 收入: 300000, 支出: 280000 },
  { name: "3月", 收入: 200000, 支出: 200000 },
  { name: "4月", 收入: 380000, 支出: 250000 },
  { name: "5月", 收入: 450000, 支出: 300000 },
  { name: "6月", 收入: 480000, 支出: 320000 },
  { name: "7月", 收入: 520000, 支出: 350000 },
  { name: "8月", 收入: 490000, 支出: 370000 },
  { name: "9月", 收入: 550000, 支出: 400000 },
  { name: "10月", 收入: 580000, 支出: 420000 },
  { name: "11月", 收入: 600000, 支出: 450000 },
  { name: "12月", 收入: 650000, 支出: 480000 }
];

// 日报数据 - 显示近12天的数据
const DAILY_DATA = [
  { name: "4-17", 收入: 15000, 支出: 9000 },
  { name: "4-18", 收入: 22000, 支出: 12000 },
  { name: "4-19", 收入: 18000, 支出: 10000 },
  { name: "4-20", 收入: 25000, 支出: 14000 },
  { name: "4-21", 收入: 20000, 支出: 12000 },
  { name: "4-22", 收入: 16000, 支出: 9500 },
  { name: "4-23", 收入: 24000, 支出: 13000 },
  { name: "4-24", 收入: 28000, 支出: 15000 },
  { name: "4-25", 收入: 32000, 支出: 16000 },
  { name: "4-26", 收入: 26000, 支出: 13500 },
  { name: "4-27", 收入: 30000, 支出: 14800 },
  { name: "4-28", 收入: 35000, 支出: 17000 }
];

const BalanceChart: React.FC<BalanceChartProps> = ({ className }) => {
  const [reportType, setReportType] = useState<"日报" | "月报">("月报");
  const data = reportType === "月报" ? MONTHLY_DATA : DAILY_DATA;
  
  return (
    <div className={cn("bg-card p-6 rounded-lg border border-border shadow-sm", className)}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">近期收支</h3>
        <Tabs 
          value={reportType} 
          onValueChange={(value: "日报" | "月报") => setReportType(value)}
          className="h-8"
        >
          <TabsList>
            <TabsTrigger value="日报" className="text-xs px-3 py-1.5">日报</TabsTrigger>
            <TabsTrigger value="月报" className="text-xs px-3 py-1.5">月报</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              formatter={(value: number) => new Intl.NumberFormat('zh-CN', {
                style: 'currency',
                currency: 'CNY',
                minimumFractionDigits: 0
              }).format(value)}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
            />
            <Legend />
            <Bar dataKey="收入" name="收入" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="支出" name="支出" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BalanceChart;
