
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { usePermissions } from "../../hooks/use-permissions";
import CurrencyTypeManager from "./CurrencyTypeManager";
import AccountTypeManager from "./AccountTypeManager";
import { Card, CardContent } from "../ui/card";
import { Wallet, CreditCard } from "lucide-react";

const AccountCategoriesTab = () => {
  // 账户类型的增删改全部要配置管理权限。会计能进这页只是为了维护汇率，
  // 给他看一个整页都点不动的 tab 没有意义
  const { can } = usePermissions();
  const canManageConfig = can('manage_configurations');

  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-0">
        <Tabs defaultValue="currency" className="w-full">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="currency" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span>币种管理</span>
            </TabsTrigger>
            {canManageConfig && (
            <TabsTrigger value="account" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span>账户类型管理</span>
            </TabsTrigger>
            )}
          </TabsList>
          <div className="mt-6">
            <TabsContent value="currency">
              <CurrencyTypeManager />
            </TabsContent>
            {canManageConfig && (
              <TabsContent value="account">
                <AccountTypeManager />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AccountCategoriesTab;
