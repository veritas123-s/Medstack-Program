import test from "node:test";
import assert from "node:assert/strict";
import { initialState, taskInput } from "../src/domain.mjs";
import { overview } from "../src/modules/dashboard/overview.mjs";
import { routeGroup } from "../src/platform/navigation.mjs";
const now = Date.parse("2026-10-02T12:00:00+08:00");
test("首页独立于分类，学习通属于教务信息", () => {
  assert.equal(routeGroup("today"), null);
  assert.equal(routeGroup("assistant"), null);
  assert.equal(routeGroup("learning"), "academic");
});
test("首页仅展示未删除未完成任务和当日课程事件，缺课表保留未知状态", () => {
  const s = initialState();
  s.tasks = [
    taskInput({ title: "当前任务", quadrant: "do", due: "2026-10-02" }),
    { ...taskInput({ title: "已删除", quadrant: "do" }), deletedAt: now },
    { ...taskInput({ title: "已完成", quadrant: "do" }), completedAt: now },
  ];
  s.events = [
    {
      id: "e",
      title: "当前日程",
      start: "2026-10-02T13:00:00+08:00",
      end: "2026-10-02T14:00:00+08:00",
    },
    {
      id: "d",
      title: "删除日程",
      start: "2026-10-02T13:00:00+08:00",
      end: "2026-10-02T14:00:00+08:00",
      deletedAt: now,
    },
  ];
  const v = overview(s, now);
  assert.deepEqual(
    v.tasks.map((t) => t.title),
    ["当前任务"],
  );
  assert.equal(v.deadlines.length, 1);
  assert.deepEqual(
    v.schedule.map((e) => e.title),
    ["当前日程"],
  );
  assert.equal(v.coverage.status, "missing");
});
test("取消快讯后首页不显示任何公开资讯", () => {
  const s = initialState();
  s.news = {
    items: [
      {
        id: "a",
        title: "当日活动",
        activityDate: "2026-10-02",
        publishedAt: now,
      },
      {
        id: "b",
        title: "删除活动",
        activityDate: "2026-10-02",
        deletedAt: now,
      },
      { id: "c", title: "其他日期", activityDate: "2026-10-03" },
    ],
  };
  assert.deepEqual(
    overview(s, now).notices.map((x) => x.title),
    [],
  );
});
test("旧学习通作业关联任务不进入首页，刷新不复活已删除通知", () => {
  const s = initialState();
  s.tasks = [
    { ...taskInput({ title: "旧课程任务", quadrant: "do" }), id: "linked-old" },
  ];
  s.learning = {
    items: [
      {
        id: "old",
        taskId: "linked-old",
        kind: "assignment",
        title: "旧作业",
        courseKey: "old-course",
        deadline: now - 200 * 86400000,
      },
      {
        id: "notice:deleted",
        kind: "notice",
        title: "已删通知",
        publishedAt: now,
        deletedAt: now,
      },
    ],
  };
  s.workflows = {
    noticeArchive: [{ item: s.learning.items[1], deletedAt: now }],
  };
  const v = overview(s, now);
  assert.equal(v.tasks.length, 0);
  assert.ok(!v.notices.some((x) => x.title === "已删通知"));
});

test("取消快讯后保留学习通通知", () => {
  const s = initialState();
  s.learning = {
    items: [
      {
        id: "notice:current",
        kind: "notice",
        title: "学习通消息",
        publishedAt: now,
      },
    ],
  };
  s.news = {
    items: [
      {
        id: "public",
        title: "公开资讯",
        source: "公开网站",
        publishedAt: now - 1000,
      },
      { id: "old-public", title: "旧资讯", publishedAt: now - 2 * 86400000 },
      {
        id: "deleted-public",
        title: "已删公开资讯",
        publishedAt: now,
        deletedAt: now,
      },
    ],
  };
  assert.deepEqual(
    new Set(overview(s, now).notices.map((x) => x.title)),
    new Set(["学习通消息"]),
  );
});

test("取消快讯后忽略历史多来源公开资讯", () => {
  const s = initialState();
  s.news = {
    items: [
      {
        id: "one",
        title: "校园医学科研交流讲座合成通知",
        source: "组织甲",
        publishedAt: now - 1000,
      },
      {
        id: "two",
        title: "校园医学科研交流讲座合成通知",
        source: "组织乙",
        publishedAt: now - 2000,
      },
    ],
  };
  const rows = overview(s, now).notices;
  assert.equal(rows.length, 0);
});

test("首页按北京时间拆分今天和明天，优先展示当天的临近安排", () => {
  const s = initialState();
  s.tasks = [
    taskInput({
      title: "今天交材料",
      quadrant: "plan",
      due: "2026-10-02",
      dueTime: "17:00",
    }),
    taskInput({ title: "明天复习", quadrant: "do", due: "2026-10-03" }),
    taskInput({ title: "往日任务", quadrant: "do", due: "2026-10-01" }),
    taskInput({ title: "未排期", quadrant: "do" }),
  ];
  s.events = [
    {
      id: "past",
      title: "已结束",
      start: "2026-10-02T09:00:00+08:00",
      end: "2026-10-02T10:00:00+08:00",
    },
    {
      id: "soon",
      title: "即将开始",
      start: "2026-10-02T12:30:00+08:00",
      end: "2026-10-02T13:30:00+08:00",
    },
    {
      id: "tomorrow",
      title: "明天的讨论",
      start: "2026-10-03T09:00:00+08:00",
      end: "2026-10-03T10:00:00+08:00",
    },
  ];
  s.learning = {
    items: [
      {
        id: "tomorrow-work",
        kind: "assignment",
        title: "明天交作业",
        deadline: Date.parse("2026-10-03T10:00:00+08:00"),
      },
      {
        id: "unknown-work",
        kind: "assignment",
        title: "截止未知",
        updatedAt: now,
      },
    ],
  };
  const v = overview(s, now);
  assert.equal(v.focus.title, "即将开始");
  assert.deepEqual(
    v.deadlines.map((x) => x.title),
    ["今天交材料"],
  );
  assert.deepEqual(
    v.tomorrow.deadlines.map((x) => x.title),
    ["明天交作业", "明天复习"],
  );
  assert.deepEqual(
    v.tomorrow.schedule.map((x) => x.title),
    ["明天的讨论"],
  );
  assert.deepEqual(
    v.overdueEntries.map((x) => x.title),
    ["往日任务"],
  );
  assert.equal(overview(s, now + 2 * 3600000).focus.title, "今天交材料");
});
