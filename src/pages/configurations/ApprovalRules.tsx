import React from "react";
import PageLayout from "@/components/layout/PageLayout";
import ApprovalRuleManager from "@/components/configurations/ApprovalRuleManager";

const ApprovalRules = () => {
  return (
    <PageLayout title="审批规则" subtitle="按金额分级配置审批链与会签人数">
      <ApprovalRuleManager />
    </PageLayout>
  );
};

export default ApprovalRules;
