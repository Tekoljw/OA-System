
import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import AccountCategoriesTab from "@/components/configurations/AccountCategoriesTab";

const AccountCategories = () => {
  return (
    <PageLayout title="账户分类" subtitle="管理币种和账户类型">
      <AccountCategoriesTab />
    </PageLayout>
  );
};

export default AccountCategories;
