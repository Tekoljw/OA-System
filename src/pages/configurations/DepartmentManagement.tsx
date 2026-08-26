
import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import DepartmentList from "@/components/configurations/departments/DepartmentList";

const DepartmentManagement = () => {
  return (
    <PageLayout title="部门配置" subtitle="管理部门结构与人员">
      <DepartmentList />
    </PageLayout>
  );
};

export default DepartmentManagement;
