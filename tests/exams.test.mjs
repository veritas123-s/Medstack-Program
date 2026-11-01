import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseExamTables,
  mergeExamEvents,
  ExamService,
} from "../electron/exams.mjs";
const page = (time = "2026年11月10日 09:00–11:00") => ({
  text: "考试安排",
  tables: [
    {
      rows: [
        ["课程名称", "考试时间", "考试地点"],
        ["合成课程", time, "西区教室"],
      ],
    },
  ],
});
test("考试表格读取明确时间，缺失起止不猜测，无表格不冒充无考试", () => {
  const items = parseExamTables(page());
  assert.equal(items[0].start, "2026-11-10T09:00");
  assert.equal(items[0].end, "2026-11-10T11:00");
  assert.equal(parseExamTables(page("待定"))[0].start, undefined);
  assert.equal(parseExamTables(page("2026-11-10 09:00"))[0].end, undefined);
  assert.equal(
    parseExamTables(page("2026-02-30 09:00-11:00"))[0].start,
    undefined,
  );
  assert.throws(
    () => parseExamTables({ text: "考试安排", tables: [] }),
    /未识别/,
  );
  assert.deepEqual(
    parseExamTables({
      text: "考试安排",
      tables: [{ rows: [["课程名称", "考试时间"], ["暂无记录"]] }],
    }),
    [],
  );
});
test("重复同步不重复日程，手工修改和删除不会被覆盖；确切旧安排撤下", () => {
  const items = parseExamTables(page()),
    state = { events: [] };
  mergeExamEvents(state, items);
  mergeExamEvents(state, items);
  assert.equal(state.events.length, 1);
  state.events[0].deletedAt = 1;
  mergeExamEvents(state, items);
  assert.equal(state.events[0].deletedAt, 1);
  state.events[0].deletedAt = null;
  state.events[0].title = "本人修改";
  mergeExamEvents(state, [], items);
  assert.equal(state.events[0].deletedAt, null);
  state.events[0].title = "考试 · 合成课程";
  mergeExamEvents(state, [], items);
  assert.ok(state.events[0].deletedAt);
});
test("考试同步失败和切换账号保留旧缓存，不落入另一账号", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-exams-"));
  let fail = false,
    allowed = true,
    resolve;
  const state = { events: [] },
    store = { change: (fn) => fn(state) };
  const service = new ExamService({
    directory: dir,
    store,
    allowed: () => allowed,
    readPage: async () => {
      if (fail) throw Error("合成失败");
      return page();
    },
  });
  try {
    await service.sync();
    const before = fs.readFileSync(service.file, "utf8");
    fail = true;
    await assert.rejects(() => service.sync());
    assert.equal(fs.readFileSync(service.file, "utf8"), before);
    assert.equal(service.status().items.length, 1);
    service.readPage = () =>
      new Promise((r) => {
        resolve = r;
      });
    const pending = service.sync();
    service.stop();
    allowed = false;
    resolve(page("2026-11-11 10:00-12:00"));
    await assert.rejects(() => pending, /切换/);
    assert.equal(fs.readFileSync(service.file, "utf8"), before);
  } finally {
    service.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
