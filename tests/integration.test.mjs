import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { initialState, taskInput, validateState } from "../src/domain.mjs";
import { buildFeed, briefingPreview, beijingDay } from "../src/briefing.mjs";
import { BriefingBridge } from "../electron/briefing-bridge.mjs";
import { Vault } from "../electron/vault.mjs";
import { CampusAuth, cookieForRestore } from "../electron/campus-auth.mjs";
import { Store } from "../electron/store.mjs";
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "veritas-v11-"));
const now = Date.parse("2026-09-24T12:00:00+08:00");
const protection = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s).map((b) => b ^ 173),
  decryptString: (b) =>
    Buffer.from(b)
      .map((x) => x ^ 173)
      .toString(),
};
function fixture() {
  const s = initialState();
  s.courseRanges = [
    { start: "2026-09-24", end: "2026-09-27", syncedAt: now - 1000 },
  ];
  s.courses = [
    {
      title: "合成课程",
      start: "2026-09-25T08:00:00",
      end: "2026-09-25T09:00:00",
      location: "合成教室",
    },
  ];
  s.tasks = [
    {
      ...taskInput({
        quadrant: "plan",
        title: "合成任务",
        due: "2026-09-25",
        dueTime: "17:00",
        notes: "PRIVATE",
      }),
      id: "task-1",
    },
  ];
  return s;
}
test("V1 数据迁移保留原文件并补齐截止钟点", () => {
  const d = dir(),
    s = initialState();
  s.schemaVersion = 1;
  s.tasks = [
    { ...taskInput({ quadrant: "plan", title: "旧任务" }), id: "old" },
  ];
  delete s.tasks[0].dueTime;
  const raw = JSON.stringify(s);
  fs.writeFileSync(path.join(d, "veritas-data.json"), raw);
  const store = new Store(d);
  assert.equal(store.state.schemaVersion, 6);
  assert.equal(store.state.tasks[0].title, "旧任务");
  assert.equal(store.state.tasks[0].dueTime, "");
  const backup = fs
    .readdirSync(d)
    .find((x) => x.startsWith("veritas-data.pre-schema"));
  assert.equal(fs.readFileSync(path.join(d, backup), "utf8"), raw);
  assert.equal(validateState(store.state).schemaVersion, 6);
});
test("截止钟点必须有日期且是合法时间", () => {
  assert.throws(() =>
    taskInput({ quadrant: "plan", title: "x", dueTime: "08:00" }),
  );
  assert.throws(() =>
    taskInput({
      quadrant: "plan",
      title: "x",
      due: "2026-09-24",
      dueTime: "24:00",
    }),
  );
  assert.equal(
    taskInput({
      quadrant: "plan",
      title: "x",
      due: "2026-09-24",
      dueTime: "23:59",
    }).dueTime,
    "23:59",
  );
});
test("快报保留同步时间和空课日，排除完成删除任务及私密笔记", () => {
  const s = fixture();
  s.tasks.push(
    { ...s.tasks[0], id: "done", completedAt: now },
    { ...s.tasks[0], id: "deleted", deletedAt: now },
  );
  const feed = buildFeed(s, now);
  assert.deepEqual(feed.timetable.courses["2026-09-24"], []);
  assert.equal(Date.parse(feed.timetable.synced_at), now - 1000);
  assert.equal(feed.tasks.length, 1);
  assert.ok(!JSON.stringify(feed).includes("PRIVATE"));
  const p = briefingPreview(feed, "2026-09-24");
  assert.equal(p.study[0].kind, "预习");
  assert.equal(p.deadlines[0].due_time, "17:00");
  assert.equal(p.warnings.length, 0);
});
test("过期与未来时间的课表不宣称无课，北京时间跨日", () => {
  const s = fixture();
  for (const ts of [now - 8 * 86400000, now + 1]) {
    s.courseRanges[0].syncedAt = ts;
    const p = briefingPreview(buildFeed(s, now), "2026-09-24");
    assert.equal(p.study.length, 0);
    assert.equal(p.warnings.length, 2);
  }
  assert.equal(beijingDay("2026-12-31T17:00:00Z"), "2027-01-01");
});
test("桥接更新、完成移除、读取固定备忘且不标记云端已部署", () => {
  const d = dir(),
    shared = path.join(d, "shared"),
    cloud = path.join(d, "cloud");
  fs.mkdirSync(path.join(shared, "reminders"), { recursive: true });
  fs.writeFileSync(
    path.join(shared, "reminders", "reminders.json"),
    JSON.stringify({
      items: [{ id: "m", message: "每周合成备忘", enabled: true }],
    }),
  );
  const b = new BriefingBridge(d);
  b.configure({ sharedRoot: shared, cloudDirectory: cloud });
  const s = fixture();
  b.export(s);
  for (const p of [
    path.join(d, "briefing", "veritas-feed.json"),
    path.join(shared, "integrations", "veritas", "veritas-feed.json"),
    path.join(cloud, "veritas-feed.json"),
  ])
    assert.equal(JSON.parse(fs.readFileSync(p)).tasks.length, 1);
  s.tasks[0].completedAt = now;
  b.export(s);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(cloud, "veritas-feed.json"))).tasks
      .length,
    0,
  );
  assert.equal(b.status.cloud, "pending_deployment");
  assert.equal(b.registry().items[0].title, "每周合成备忘");
});
test("登录资料加密存储、恢复、损坏处理且禁止明文降级", () => {
  const d = dir(),
    v = new Vault(d, protection);
  v.save({
    credentials: { username: "synthetic-user", password: "synthetic-secret" },
  });
  assert.ok(!fs.readFileSync(v.file).includes("synthetic-secret"));
  assert.equal(
    new Vault(d, protection).data.credentials.password,
    "synthetic-secret",
  );
  assert.ok(!JSON.stringify(v.status()).includes("synthetic-secret"));
  const locked = new Vault(dir(), { isEncryptionAvailable: () => false });
  assert.throws(() => locked.save({ cookies: [] }), /加密/);
  assert.equal(fs.existsSync(locked.file), false);
  fs.writeFileSync(v.file, "broken");
  assert.ok(new Vault(d, protection).warning);
  v.clear();
  assert.equal(fs.existsSync(v.file), false);
});
test("恢复会话过滤过期和校外 cookie", () => {
  const c = {
    domain: ".shsmu.edu.cn",
    name: "session",
    value: "synthetic",
    path: "/",
    expirationDate: 100,
  };
  assert.equal(cookieForRestore(c, 101), null);
  assert.equal(
    cookieForRestore({ ...c, domain: "shsmu.edu.cn.example.org" }, 90),
    null,
  );
  assert.equal(cookieForRestore(c, 90).domain, ".shsmu.edu.cn");
  assert.equal(
    cookieForRestore({ ...c, hostOnly: true }, 90).domain,
    undefined,
  );
});
test("认证失效只重试一次、网络错误不自动登录", async () => {
  const v = new Vault(dir(), protection),
    cookies = new EventEmitter();
  cookies.get = async () => [];
  cookies.set = async () => {};
  let calls = 0,
    renews = 0;
  const session = {
    cookies,
    fetch: async () =>
      ++calls === 1
        ? new Response("login", { status: 401 })
        : new Response("{}"),
  };
  const a = new CampusAuth({ session, vault: v });
  a.renew = async () => {
    renews++;
  };
  assert.deepEqual(
    await a.request("https://webvpn2.shsmu.edu.cn", "/test"),
    {},
  );
  assert.equal(calls, 2);
  assert.equal(renews, 1);
  session.fetch = async () => new Response("broken", { status: 500 });
  await assert.rejects(() =>
    a.request("https://webvpn2.shsmu.edu.cn", "/test"),
  );
  assert.equal(renews, 1);
  session.fetch = async () => new Response("<h1>教务系统维护中</h1>");
  await assert.rejects(
    () => a.request("https://webvpn2.shsmu.edu.cn", "/test"),
    /数据格式异常/,
  );
  assert.equal(renews, 1);
  a.configure({ remember: false });
  assert.equal(v.data.cookies.length, 0);
  assert.equal(v.data.credentials, null);
});
