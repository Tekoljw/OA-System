
import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import AssetCategoriesTab from "@/components/configurations/AssetCategoriesTab";

const AssetCategories = () => {
  return (
    <PageLayout title="资产分类" subtitle="管理资产和借贷分类">
      <AssetCategoriesTab />
    </PageLayout>
  );
};

export default AssetCategories;
