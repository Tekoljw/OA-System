
import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import AccountTabs from "@/components/accounts/AccountTabs";

const AccountManagement = () => {
  return (
    <PageLayout title="账户管理" subtitle="管理您的所有账户">
      <AccountTabs />
    </PageLayout>
  );
};

export default AccountManagement;
