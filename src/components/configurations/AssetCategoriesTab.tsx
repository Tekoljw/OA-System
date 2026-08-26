
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import AssetTypeManager from "./AssetTypeManager";
import LoanTypeManager from "./LoanTypeManager";
import { Card, CardContent } from "../ui/card";
import { Package, Landmark } from "lucide-react";

const AssetCategoriesTab = () => {
  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-0">
        <Tabs defaultValue="asset" className="w-full">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="asset" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>资产分类管理</span>
            </TabsTrigger>
            <TabsTrigger value="loan" className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              <span>借贷分类管理</span>
            </TabsTrigger>
          </TabsList>
          <div className="mt-6">
            <TabsContent value="asset">
              <AssetTypeManager />
            </TabsContent>
            <TabsContent value="loan">
              <LoanTypeManager />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AssetCategoriesTab;
