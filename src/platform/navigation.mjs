export const NAV_GROUPS = [
  { id: "research", title: "学习与科研" },
  { id: "efficiency", title: "效率工具" },
  { id: "academic", title: "教务信息" },
];
export function routeGroup(id) {
  if (["research-hub", "research-projects", "knowledge"].includes(id))
    return "research";
  if (["today", "assistant"].includes(id)) return null;
  if (["campus", "notifications", "canvas", "learning"].includes(id))
    return "academic";
  return "efficiency";
}
