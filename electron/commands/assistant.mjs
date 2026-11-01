import { followIntent } from "../news-organizations.mjs";
import { widgetIntent, addWidget } from "../../src/platform/widget-recipes.mjs";
import { randomUUID } from "node:crypto";
export default async function execute(
  action,
  p,
  { assistant, store, bridge, broadcast, workflows, learning, news },
) {
  if (action === "assistant.configure") assistant.configure(p);
  else if (action === "assistant.models") await assistant.models();
  else if (action === "assistant.chat") {
    const widget = widgetIntent(p.text);
    if (widget) {
      store.change((state) => {
        state.workspace = addWidget(
          state.workspace,
          widget,
          "custom-" + randomUUID(),
        );
      });
      await assistant.actionReply(
        p.text,
        `已将「${widget.title}」小组件添加到首页。可在组件中编辑或在主题与小组件中管理。`,
      );
      broadcast();
      return assistant.status(store.state);
    }
    const organization = followIntent(p.text);
    if (organization) {
      await assistant.actionReply(p.text, "校园快讯已取消，不能再关注公众号。");
      broadcast();
      return assistant.status(store.state);
    }
    const entry = await assistant.chat(
      p,
      {
        ...store.state,
        learning: learning?.status(),
      },
      () => store.state,
    );
    if (
      workflows?.data.autoCommit &&
      entry.tasks.length &&
      /添加|新建|创建|安排|记下|记住/.test(p.text)
    ) {
      assistant.commit({ id: entry.id, tasks: entry.tasks }, store);
      workflows.record(
        "Poseidon 自动建任务",
        entry.tasks.map((t) => `ai-${entry.id}-${t.draftIndex}`),
      );
      bridge.export(store.state);
      broadcast();
    }
  } else if (action === "assistant.cancel") assistant.cancel();
  else if (action === "assistant.clear") assistant.clear();
  else if (action === "assistant.forget") assistant.forget();
  else if (action === "assistant.commit") {
    const result = assistant.commit(p, store);
    try {
      bridge.export(store.state);
    } catch {
      bridge.status.local = "error";
      bridge.status.message = "任务已保存，本机快报文件未能更新，请检查目录。";
    }
    broadcast();
    return { ...assistant.status(store.state), commit: result };
  }
  return assistant.status(store.state);
}
