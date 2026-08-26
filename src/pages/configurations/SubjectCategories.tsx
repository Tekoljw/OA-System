
import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import SubjectCategoriesTab from "@/components/configurations/SubjectCategoriesTab";

const SubjectCategories = () => {
  return (
    <PageLayout title="科目分类" subtitle="管理收支科目分类">
      <SubjectCategoriesTab />
    </PageLayout>
  );
};

export default SubjectCategories;
