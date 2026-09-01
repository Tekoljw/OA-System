
import React from "react";
import { Card, CardContent } from "../ui/card";
import SubjectPoolManager from "./SubjectPoolManager";

const SubjectCategoriesTab = () => {
  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-0">
        {/* 收入/支出不再各是一个大池子：科目按一级流水类型分池，
            由 SubjectPoolManager 用类型页签切换 */}
        <SubjectPoolManager />
      </CardContent>
    </Card>
  );
};

export default SubjectCategoriesTab;
