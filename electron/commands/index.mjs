import tasks from "./tasks.mjs";
import timer from "./timer.mjs";
import settings from "./settings.mjs";
import logs from "./logs.mjs";
import campusAuth from "./campus-auth.mjs";
import campus from "./campus.mjs";
import briefing from "./briefing.mjs";
import storage from "./storage.mjs";
import workspace from "./workspace.mjs";
import assistant from "./assistant.mjs";
import agenda from "./agenda.mjs";
import content from "./content.mjs";
import appearance from "./appearance.mjs";
import calendar from "./calendar.mjs";
import { makeRouter } from "./router.mjs";
import news from "./news.mjs";
import links from "./links.mjs";
import workhub from "./workhub.mjs";
export function createCommandRouter(context) {
  return makeRouter(
    [
      {
        names: [
          "hub.save",
          "hub.delete",
          "hub.restore",
          "hub.link",
          "hub.createTask",
          "hub.createEvent",
          "hub.noteRestore",
        ],
        execute: workhub,
      },
      { names: ["link.open"], execute: links },
      {
        names: [
          "news.state",
          "news.image",
          "news.collect",
          "news.configure",
          "news.import",
          "news.delete",
          "news.restore",
          "news.open",
          "news.follow",
          "news.unfollow",
          "news.activity",
        ],
        execute: news,
      },
      {
        names: [
          "calendar.export",
          "calendar.import.preview",
          "calendar.import.commit",
          "calendar.import.cancel",
        ],
        execute: calendar,
      },
      { names: ["background.import"], execute: appearance },
      {
        names: [
          "list.save",
          "list.delete",
          "list.restore",
          "event.save",
          "event.delete",
          "event.restore",
          "course.delete",
          "course.restore",
          "scores.clear",
        ],
        execute: content,
      },
      {
        names: [
          "learning.open",
          "learning.sync",
          "learning.logout",
          "workflow.configure",
          "workflow.undo",
          "notification.read",
          "notification.delete",
          "notification.restore",
        ],
        execute: agenda,
      },
      {
        names: [
          "assistant.state",
          "assistant.configure",
          "assistant.models",
          "assistant.chat",
          "assistant.cancel",
          "assistant.clear",
          "assistant.forget",
          "assistant.commit",
        ],
        execute: assistant,
      },
      {
        names: ["task.save", "task.complete", "task.delete", "task.restore"],
        execute: tasks,
      },
      { names: ["timer"], execute: timer },
      { names: ["settings", "notice.dismiss"], execute: settings },
      { names: ["log.add", "log.delete", "log.restore"], execute: logs },
      {
        names: [
          "school.open",
          "school.canvas.open",
          "school.login.configure",
          "school.login.renew",
          "school.logout",
        ],
        execute: campusAuth,
      },
      {
        names: [
          "school.courses",
          "school.scores",
          "school.exams",
          "school.exams.open",
          "school.detail",
          "school.rooms.options",
          "school.rooms",
          "school.rooms.building",
        ],
        execute: campus,
      },
      {
        names: [
          "briefing.state",
          "briefing.cloud.state",
          "briefing.cloud.login",
          "briefing.cloud.logout",
          "briefing.cloud.bind",
          "briefing.cloud.open",
          "briefing.cloud.deploy",
          "briefing.cloud.test",
          "briefing.cloud.received",
          "briefing.sync.configure",
          "briefing.sync.now",
          "briefing.sync.disconnect",
          "briefing.export",
          "briefing.choose",
          "briefing.folder",
        ],
        execute: briefing,
      },
      {
        names: ["export.backup", "export.csv", "import.backup", "data.folder"],
        execute: storage,
      },
      {
        names: [
          "workspace.configure",
          "workspace.reset",
          "widget.configure",
          "widget.delete",
          "widget.restore",
        ],
        execute: workspace,
      },
    ],
    context,
  );
}
