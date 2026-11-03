import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initialState, taskInput } from "../src/domain.mjs";
import {
  calendarDate,
  shiftDate,
  monthDays,
  calendarEvents,
  eventsOnDay,
  courseCoverage,
} from "../src/calendar.mjs";
import { Workflows } from "../electron/workflows.mjs";
import { agenda, learningEntries } from "../src/agenda.mjs";
test("学习通确定截止时间可进入日历，任务去重并遵守删除与估算标记", () => {
  const state = initialState();
  const deadline = Date.now() + 86400000;
  const assignment = {
    kind: "assignment",
    id: "work:synthetic",
    title: "合成截止",
    deadline,
    taskId: "cx-synthetic",
  };
  state.learning = {
    items: [
      assignment,
      {
        ...assignment,
        id: "work:estimate",
        taskId: "cx-estimate",
        estimated: true,
      },
    ],
  };
  assert.deepEqual(
    calendarEvents(state).map((item) => [item.kind, item.start]),
    [["assignment", deadline]],
  );
  state.tasks.push(
    taskInput(
      { title: assignment.title, due: "2026-10-01", quadrant: "plan" },
      { id: assignment.taskId },
    ),
  );
  assert.deepEqual(
    calendarEvents(state).map((item) => item.kind),
    ["task"],
  );
  state.tasks[0].deletedAt = Date.now();
  assert.equal(calendarEvents(state).length, 0);
});
const directory = () => fs.mkdtempSync(path.join(os.tmpdir(), "medstack-v21-"));
const notice = {
  id: "notice:synthetic",
  kind: "notice",
  title: "合成通知",
  summary: "合成摘要",
  updatedAt: 1000,
};
test("删除通知跨重启和再次同步持久隐藏，恢复不影响作业/任务/专注", () => {
  const dir = directory(),
    w = new Workflows(dir),
    s = initialState();
  const assignment = {
    id: "work:1",
    kind: "assignment",
    title: "作业",
    done: false,
    deadline: Date.now() + 86400000,
  };
  const learning = { items: [notice, assignment] };
  const original = JSON.stringify(s);
  w.notices([notice.id, assignment.id, "task:1"], learning.items);
  const reload = new Workflows(dir);
  s.workflows = reload.data;
  assert.equal(reload.data.noticeArchive.length, 1);
  assert.ok(!agenda(s, learning).entries.some((e) => e.kind === "notice"));
  assert.ok(agenda(s, learning).entries.some((e) => e.kind === "assignment"));
  assert.equal(learningEntries(s, learning, { deleted: true }).length, 1);
  reload.notices([notice.id], [], true);
  assert.equal(
    agenda(s, { items: [] }).entries.filter((e) => e.kind === "notice").length,
    1,
    "恢复旧缓存已移出的通知摘要",
  );
  delete s.workflows;
  assert.equal(JSON.stringify(s), original);
});
test("批量删除稳定去重，恢复其中一项，保存失败不会改变可见状态", () => {
  const w = new Workflows(directory()),
    items = [notice, { ...notice, id: "notice:2" }];
  w.notices(
    items.map((x) => x.id),
    items,
  );
  w.notices([notice.id], items);
  assert.equal(w.data.noticeArchive.length, 2);
  w.notices([notice.id], items, true);
  assert.equal(w.data.noticeArchive.filter((x) => x.deletedAt).length, 1);
  const old = JSON.stringify(w.data);
  w.save = () => {
    throw Error("模拟磁盘写入失败");
  };
  assert.throws(() => w.notices(["notice:2"], items, true));
  assert.equal(JSON.stringify(w.data), old);
});
test("V2工作流数据向后兼容，损坏归档不被覆盖", () => {
  const dir = directory(),
    file = path.join(dir, "medstack-workflows.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, read: [], audit: [], autoImport: false }),
  );
  const w = new Workflows(dir);
  assert.deepEqual(w.data.noticeArchive, []);
  assert.equal(w.data.autoImport, false);
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, read: [], audit: [], noticeArchive: [{}] }),
  );
  const bytes = fs.readFileSync(file);
  const damaged = new Workflows(dir);
  assert.throws(() => damaged.notices([notice.id], [notice]));
  assert.deepEqual(fs.readFileSync(file), bytes);
});
test("日历闰年、跨月跨年与合法日期边界", () => {
  assert.equal(calendarDate("2028-02-29"), true);
  assert.equal(calendarDate("2026-02-29"), false);
  assert.equal(shiftDate("2028-02-29", 1, "year"), "2029-02-28");
  assert.equal(shiftDate("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2099-12-31", 1), "2099-12-31");
  const days = monthDays("2028-02-15");
  assert.equal(days.length, 42);
  assert.ok(days.includes("2028-02-29"));
  assert.equal(new Date(days[0] + "T12:00:00Z").getUTCDay(), 1);
});
test("年/月/日共用事件，任务截止日与北京时间跨日课程不重复不漏记", () => {
  const s = initialState();
  s.tasks = [
    taskInput({ title: "全天任务", quadrant: "plan", due: "2026-09-28" }),
    taskInput({ title: "已完成", quadrant: "plan", due: "2026-09-28" }),
    taskInput({ title: "待安排", quadrant: "plan" }),
  ];
  s.tasks[1].completedAt = 1;
  s.courses = [
    {
      title: "跨日课程",
      start: "2026-09-28T15:30:00Z",
      end: "2026-09-28T17:00:00Z",
    },
    {
      title: "零点结束",
      start: "2026-09-28T23:00:00",
      end: "2026-09-29T00:00:00",
    },
  ];
  let events = calendarEvents(s);
  assert.equal(events.length, 4);
  assert.equal(eventsOnDay(events, "2026-09-28").length, 4);
  assert.equal(eventsOnDay(events, "2026-09-29").length, 1);
  assert.equal(events.find((e) => e.title === "跨日课程").clock, "23:30–01:00");
  assert.equal(
    calendarEvents(s, { showCompleted: false, showCourses: false }).length,
    1,
  );
  s.tasks[0].deletedAt = 1;
  assert.equal(
    calendarEvents(s, { showCompleted: false, showCourses: false }).length,
    0,
  );
});
test("课表新鲜度区分已同步、过期和未覆盖，缓存课程不会因过期消失", () => {
  const s = initialState(),
    now = Date.parse("2026-09-28T10:00:00+08:00");
  s.courseRanges = [{ start: "2026-09-28", end: "2026-09-29", syncedAt: now }];
  assert.equal(courseCoverage(s, "2026-09-28", now).status, "fresh");
  assert.equal(courseCoverage(s, "2026-09-29", now).status, "missing");
  assert.equal(
    courseCoverage(s, "2026-09-28", now + 8 * 86400000).status,
    "stale",
  );
  s.courses = [
    {
      title: "历史课程",
      start: "2026-09-28T10:00:00",
      end: "2026-09-28T11:00:00",
    },
  ];
  assert.equal(calendarEvents(s).length, 1);
});
