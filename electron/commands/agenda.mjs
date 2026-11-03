export default async function execute(
  action,
  p,
  { learning, workflows, store, bridge, broadcast },
) {
  if (action === "learning.open") await learning.open(p.kind, p.id);
  if (action === "learning.sync") await learning.sync();
  if (action === "learning.logout") await learning.logout();
  if (action === "workflow.configure") workflows.configure(p);
  if (action === "workflow.undo") workflows.undo(p.id, store);
  if (action === "notification.read")
    workflows.mark(Array.isArray(p.ids) ? p.ids.slice(0, 1000) : []);
  if (action === "notification.delete" || action === "notification.restore") {
    workflows.notices(
      Array.isArray(p.ids) ? p.ids.slice(0, 1000) : [],
      learning.status().items,
      action === "notification.restore",
    );
    workflows.assignments(
      Array.isArray(p.ids) ? p.ids.slice(0, 1000) : [],
      learning.status().items,
      store,
      action === "notification.restore",
    );
  }
}
