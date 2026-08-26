
import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import TransactionTypesList from "@/components/configurations/TransactionTypesList";

const TransactionTypes = () => {
  return (
    <PageLayout title="流水类型" subtitle="系统内置的流水分类">
      <TransactionTypesList />
    </PageLayout>
  );
};

export default TransactionTypes;
