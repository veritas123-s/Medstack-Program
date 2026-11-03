import { lazy } from "react";
import { GraduationCap } from "lucide-react";
export default {
  id: "campus",
  title: "校园",
  description: "考试、成绩和教室信息。",
  apiVersion: 1,
  version: "1.2.0",
  order: 4,
  routes: [
    {
      id: "campus",
      title: "教务服务",
      icon: GraduationCap,
      Component: lazy(() => import("./CampusPage.jsx")),
      hiddenNav: false,
    },
  ],
};
