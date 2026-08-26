
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import IncomeTypeManager from "./IncomeTypeManager";
import ExpenseTypeManager from "./ExpenseTypeManager";
import { Card, CardContent } from "../ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

const SubjectCategoriesTab = () => {
  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-0">
        <Tabs defaultValue="income" className="w-full">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="income" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span>收入科目分类管理</span>
            </TabsTrigger>
            <TabsTrigger value="expense" className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span>支出科目分类管理</span>
            </TabsTrigger>
          </TabsList>
          <div className="mt-6">
            <TabsContent value="income">
              <IncomeTypeManager />
            </TabsContent>
            <TabsContent value="expense">
              <ExpenseTypeManager />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SubjectCategoriesTab;
