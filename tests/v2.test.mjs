import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initialState,
  timerAction,
  tickTimer,
  taskInput,
} from "../src/domain.mjs";
import { agenda, selectModel } from "../src/agenda.mjs";
import {
  parseCourses,
  parseDeadline,
  parseNotices,
  isLearningURL,
  assignmentPageURL,
} from "../electron/learning-parser.mjs";
import { LearningService } from "../electron/learning-service.mjs";
import { Workflows } from "../electron/workflows.mjs";
import { Store } from "../electron/store.mjs";
test("作业入口沿用学习通会话，只打开同步得到的对应官方作业", async () => {
  const id = "work:10:20:30";
  const url = "https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?courseId=10&classId=20&workId=30&enc=fixture";
  assert.equal(assignmentPageURL(url, id), url);
  for (const invalid of [
    url.replace("workId=30", "workId=31"),
    url.replace("classId=20", "classId=21"),
    url.replace("/work/task", "/work/submit"),
    url.replace("mooc1.chaoxing.com", "mooc1.chaoxing.com.example.org"),
    url + "&workId=31",
  ]) assert.equal(assignmentPageURL(invalid, id), "");

  const loaded = [];
  const service = Object.assign(Object.create(LearningService.prototype), {
    secrets: { data: {} },
    data: { items: [{ id, kind: "assignment", assignmentURL: url }] },
    window: {
      isDestroyed: () => false,
      show() {},
      focus() {},
      async loadURL(target) { loaded.push(target); },
    },
  });
  const [item] = service.status().items;
  assert.equal(item.canOpenAssignment, true);
  assert.equal(Object.hasOwn(item, "assignmentURL"), false);
  await assert.rejects(service.open("assignment", "work:10:20:31"), /官方作业入口/);
  await service.open("assignment", id);
  assert.deepEqual(loaded, [url]);
});
test("可选择归档课程且不读取教师班级，非法截止日期不溢出", () => {
  const c = (id, isretire, role = 3) => ({
    content: {
      id,
      cpi: id,
      isretire,
      roletype: role,
      course: { data: [{ id, name: "合成课程" }] },
    },
  });
  const data = { result: 1, channelList: [c(1, 0), c(2, 1), c(3, 0, 1)] };
  assert.equal(parseCourses(data).length, 1);
  assert.equal(parseCourses(data, { includeArchived: true }).length, 2);
  assert.equal(parseDeadline("2026-02-30 10:00").deadline, null);
  assert.equal(parseDeadline("09-31 24:00").deadline, null);
});
test("损坏工作流文件不能通过失败的保存激活自动建任务权限", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-config-"));
  fs.writeFileSync(path.join(dir, "medstack-workflows.json"), "broken");
  const w = new Workflows(dir);
  assert.throws(() => w.configure({ autoCommit: true }));
  assert.equal(w.data.autoCommit, false);
  assert.equal(fs.readFileSync(w.file, "utf8"), "broken");
});
test("真实协议回归：通知uuid、分页结束与月日截止的年份推定", () => {
  const n = parseNotices({
    status: true,
    notices: {
      list: [
        { uuid: "synthetic-uuid", title: "通知", content: "<b>合成摘要</b>" },
      ],
      lastPage: true,
    },
  });
  assert.equal(n.items.length, 1);
  assert.equal(n.items[0].id, "notice:synthetic-uuid");
  assert.equal(n.items[0].summary, "合成摘要");
  assert.equal(n.lastPage, true);
  const d = parseDeadline(
    "09-24 21:30",
    Date.parse("2026-09-27T10:00:00+08:00"),
  );
  assert.equal(d.deadline, Date.parse("2026-09-24T21:30:00+08:00"));
  assert.equal(d.yearInferred, true);
  assert.equal(
    parseDeadline("01-02 10:00", Date.parse("2026-12-31T10:00:00+08:00"))
      .deadline,
    Date.parse("2027-01-02T10:00:00+08:00"),
  );
});
test("自定番茄时长真实记账，暂停不计入，非法时长拒绝", () => {
  const s = initialState();
  timerAction(s, "start", { mode: "focus", durationMinutes: 45 }, 100000);
  assert.equal(s.timer.targetMs, 2700000);
  timerAction(s, "pause", {}, 160000);
  timerAction(s, "start", {}, 200000);
  tickTimer(s, 200000 + 2640000);
  assert.equal(s.logs[0].durationMs, 2700000);
  assert.equal(s.cycles, 1);
  assert.throws(() =>
    timerAction(initialState(), "start", { durationMinutes: -2 }),
  );
  assert.throws(() =>
    timerAction(initialState(), "start", { durationMinutes: 181 }),
  );
});
test("推荐尊重当前课程、任务截止时间、临近上课空档和已运行计时", () => {
  const now = Date.parse("2026-09-27T10:00:00+08:00"),
    s = initialState();
  s.tasks = [taskInput({ title: "报告", quadrant: "do", due: "2026-09-27" })];
  s.courseRanges = [{ start: "2026-09-27", end: "2026-09-28", syncedAt: now }];
  s.courses = [
    { title: "下午", start: "2026-09-27T14:00:00", end: "2026-09-27T15:00:00" },
    { title: "上午", start: "2026-09-27T10:20:00", end: "2026-09-27T11:00:00" },
  ];
  assert.equal(agenda(s, {}, now).recommendation.minutes, 15);
  assert.equal(
    agenda(s, {}, now + 15 * 60000).recommendation.title,
    "准备下一节课",
  );
  assert.match(
    agenda(s, {}, now + 25 * 60000).recommendation.title,
    /现在是 上午/,
  );
  timerAction(s, "start", { mode: "focus" }, now);
  assert.equal(agenda(s, {}, now).recommendation.action, "focus");
});
test("模型路由仅使用当前服务列表，默认与手动选择可保留", () => {
  const cfg = {
    defaultModel: "deepseek-chat",
    models: ["deepseek-reasoner", "qwen3coder"],
  };
  assert.equal(
    selectModel({ ...cfg, text: "帮我规划计划" }),
    "deepseek-reasoner",
  );
  assert.equal(selectModel({ ...cfg, text: "写python代码" }), "qwen3coder");
  assert.equal(
    selectModel({ ...cfg, mode: "default", text: "写代码" }),
    "deepseek-chat",
  );
  assert.equal(
    selectModel({ ...cfg, models: [], text: "规划" }),
    "deepseek-chat",
  );
  assert.throws(() => selectModel({ ...cfg, mode: "not-listed" }));
});
test("学习通允许域和课程格式验证，倒计时与绝对截止区分", () => {
  assert.ok(isLearningURL("https://passport2.chaoxing.com/login"));
  for (const u of [
    "http://i.chaoxing.com",
    "https://chaoxing.com.evil.test",
    "https://x@i.chaoxing.com",
  ])
    assert.equal(isLearningURL(u), false);
  assert.throws(() => parseCourses({ result: 0 }));
  assert.equal(parseCourses({ result: 1, channelList: [] }).length, 0);
  const now = Date.parse("2026-09-27T10:00:00+08:00");
  assert.deepEqual(parseDeadline("剩余2小时30分钟", now), {
    deadline: now + 150 * 60000,
    estimated: true,
  });
  assert.equal(
    parseDeadline("截止：2026-09-28 18:00").deadline,
    Date.parse("2026-09-28T18:00:00+08:00"),
  );
  assert.equal(parseDeadline("未交").deadline, null);
  assert.throws(() => parseNotices({ status: false, notices: { list: [] } }));
});
test("自动作业去重、截止更新尊重用户编辑、撤销后不重新生成、重启保留", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-workflow-"));
  const store = new Store(dir),
    w = new Workflows(dir);
  const item = {
    id: "work:1:2:3",
    title: "报告",
    course: "课程",
    kind: "assignment",
    deadline: Date.parse("2026-09-28T18:00:00+08:00"),
    estimated: false,
  };
  assert.equal(w.importLearning([item], store), 1);
  assert.equal(w.importLearning([item], store), 0);
  assert.equal(store.state.tasks[0].dueTime, "18:00");
  w.importLearning([{ ...item, deadline: item.deadline + 3600000 }], store);
  assert.equal(store.state.tasks[0].dueTime, "19:00");
  store.change((s) => (s.tasks[0].dueTime = "16:00"));
  w.importLearning([{ ...item, deadline: item.deadline + 7200000 }], store);
  assert.equal(store.state.tasks[0].dueTime, "16:00");
  w.undo(w.data.audit[0].id, store);
  assert.ok(store.state.tasks[0].deletedAt);
  assert.equal(w.importLearning([item], store), 0);
  assert.equal(new Workflows(dir).data.audit[0].undone, true);
  assert.equal(store.state.logs.length, 0);
});
test("估算截止不冒充精确任务DDL，通知已读键不随刷新时间变化", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-estimate-")),
    s = new Store(dir),
    w = new Workflows(dir);
  const x = {
    id: "work:1",
    kind: "assignment",
    title: "报告",
    course: "课程",
    deadline: Date.now() + 300000,
    estimated: true,
    updatedAt: 1,
  };
  w.importLearning([x], s);
  assert.equal(s.state.tasks[0].due, "");
  const a = agenda(s.state, { items: [x] });
  const b = agenda(s.state, {
    items: [{ ...x, deadline: x.deadline + 60000, updatedAt: 2 }],
  });
  assert.equal(a.entries[0].id, b.entries[0].id);
});
