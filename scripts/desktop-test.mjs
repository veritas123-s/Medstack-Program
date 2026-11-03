import {
  launchAuthenticated,
  fixtureProfile,
} from "./account-test-fixture.mjs";
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { beijingDay } from "../src/briefing.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veritas-e2e-"));
const output = path.join(root, "test-results");
fs.mkdirSync(output, { recursive: true });
const assignmentDeadline = Date.now() + 86400000;
fs.writeFileSync(
  path.join(dataDir, "learning-cache.json"),
  JSON.stringify({
    version: 1,
    items: [
      {
        id: "work:1:2:3",
        kind: "assignment",
        title: "合成学习通截止",
        deadline: assignmentDeadline,
        course: "合成课程",
        assignmentURL: "https://mooc1.chaoxing.com/mooc2/work/task?courseId=1&classId=2&workId=3&enc=synthetic",
      },
    ],
  }),
);
const env = { ...process.env, VERITAS_TEST: "1", VERITAS_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
const launchOptions = {
  ...(process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [] }
    : { args: [root] }),
  env,
  timeout: 30000,
};
let app;
const checks = [];
const ok = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  app = await launchAuthenticated(launchOptions);
  let page = await app.firstWindow();
  await page.getByRole("heading", { name: "今天的安排" }).waitFor();
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await tour.waitFor({ state: "hidden" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  await page.screenshot({ path: path.join(output, "01-overview-empty.png") });
  ok("独立桌面启动、空白状态、渲染沙箱");
  await page.getByRole("button", { name: "整理侧栏" }).click();
  await page.getByRole("button", { name: "仅显示功能板块" }).click();
  assert.match(
    (await page.locator(".sidebar").getAttribute("class")) || "",
    /collapsed/,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "整理侧栏" }).click();
  await page
    .getByRole("dialog", { name: "整理侧栏" })
    .getByRole("button", { name: "展开侧栏" })
    .click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  ok("侧栏收起、展开与偏好保存");
  await page.locator(".new-task").click();
  await page.getByLabel("任务名称", { exact: true }).fill("测试：阅读一篇文献");
  await page.getByLabel("所属清单", { exact: true }).fill("科研");
  await page.getByLabel("截止日期", { exact: true }).fill("2026-09-25");
  await page.getByLabel("截止钟点（可选）").fill("17:30");
  await page.getByPlaceholder("拆成一个小步骤…").fill("阅读方法部分");
  await page.getByRole("button", { name: "添加步骤", exact: true }).click();
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: /^任务清单/ }).click();
  await page
    .getByRole("button", { name: "测试：阅读一篇文献", exact: true })
    .waitFor();
  let state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].subtasks.length, 1);
  ok("创建任务、清单、截止日期与子任务");
  await page.getByRole("button", { name: "四象限", exact: true }).click();
  await page.locator(".task-card").dragTo(page.locator(".q-do"));
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.tasks[0].quadrant, "do");
  ok("四象限拖动修改优先级");
  await page
    .locator('summary[aria-label="任务操作 测试：阅读一篇文献"]')
    .click();
  await page.getByRole("button", { name: "编辑 测试：阅读一篇文献" }).click();
  await page.getByLabel("完成后重复").selectOption("daily");
  await page.getByLabel("阅读方法部分", { exact: true }).check();
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page
    .getByRole("button", { name: "完成 测试：阅读一篇文献", exact: true })
    .click();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.tasks.length, 2);
  assert.ok(state.tasks[0].completedAt);
  assert.equal(state.tasks[1].subtasks[0].done, false);
  ok("完成任务、生成重复任务并重置子任务");
  await page
    .locator('summary[aria-label="任务操作 测试：阅读一篇文献"]')
    .click();
  await page
    .getByRole("button", { name: "删除 测试：阅读一篇文献", exact: true })
    .click();
  await page.getByRole("button", { name: "回收站", exact: true }).click();
  await page.getByRole("button", { name: "恢复任务" }).click();
  await page.getByRole("button", { name: "待办", exact: true }).click();
  ok("任务删除与回收站恢复");
  await page
    .locator('summary[aria-label="任务操作 测试：阅读一篇文献"]')
    .click();
  await page.getByRole("button", { name: "专注 测试：阅读一篇文献" }).click();
  await page.getByRole("button", { name: "正计时", exact: true }).click();
  await page.getByRole("button", { name: "开始专注", exact: true }).click();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "继续专注", exact: true }).waitFor();
  const paused = await page.getByTestId("timer-display").textContent();
  await page.waitForTimeout(1100);
  assert.equal(await page.getByTestId("timer-display").textContent(), paused);
  await page.screenshot({ path: path.join(output, "02-focus.png") });
  await page.getByRole("button", { name: "继续专注", exact: true }).click();
  await page.waitForTimeout(1100);
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit("suspend"));
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.timer.status, "paused");
  await page
    .getByRole("button", { name: "保存并结束计时", exact: true })
    .click();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.logs.length, 1);
  assert.equal(state.logs[0].taskId, state.tasks[1].id);
  assert.equal(state.logs[0].segments.length, 2);
  ok("正计时、暂停继续、模拟系统休眠与按任务记账");
  await page.getByRole("button", { name: "时间记录", exact: true }).click();
  await page.getByRole("button", { name: "补记时间", exact: true }).click();
  await page.getByLabel("工作内容").fill("测试：手动补记");
  await page.getByLabel("开始时间").fill("2026-09-20T10:00");
  await page.getByLabel("结束时间").fill("2026-09-20T10:30");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.logs.length, 2);
  assert.equal(state.logs[1].durationMs, 1800000);
  const overlap = await page.evaluate(async () => {
    try {
      await window.veritas.call("log.add", {
        start: "2026-09-20T10:15",
        end: "2026-09-20T11:00",
      });
      return "";
    } catch (e) {
      return e.message;
    }
  });
  assert.match(overlap, /重叠/);
  ok("手动补记、重叠检测");
  await app.evaluate(({ session }) => {
    session.fromPartition("veritas-school").fetch = async (url) => {
      if (url.includes("GetCurriculumTable"))
        return new Response(
          JSON.stringify({
            List: [
              {
                Curriculum: "测试课程（合成数据）",
                Start: "2026-09-24T08:00:00",
                End: "2026-09-24T09:30:00",
                Classroom: "测试教室",
              },
            ],
          }),
        );
      if (url.includes("GetStuYearScore"))
        return new Response(
          JSON.stringify({
            1: ["2026-2027"],
            2: [
              [
                {
                  CurriculumName: "测试课程",
                  Score: 88,
                  Semester: 1,
                  Credit: 2,
                },
              ],
            ],
            4: "测试数据",
          }),
        );
      if (url.includes("getDict")) {
        const type = new URL(url).searchParams.get("type");
        if (type === "Classroom")
          await new Promise((resolve) => setTimeout(resolve, 1000));
        return new Response(
          JSON.stringify({
            data:
              type === "Classroom"
                ? [
                    { code: "busy", name: "合成 101" },
                    { code: "free", name: "合成 102" },
                    { code: "unknown", name: "合成 103" },
                  ]
                : [{ code: "test", name: "测试选项" }],
          }),
        );
      }
      const room = new URL(url).searchParams.get("classroomId");
      if (room === "unknown") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return new Response("unavailable", { status: 503 });
      }
      if (room === "free") return Response.json({ data: [] });
      return new Response(
        JSON.stringify({
          data: [
            {
              coursename: "合成教室占用",
              periodbegintime: "08:00",
              periodendtime: "09:00",
            },
          ],
        }),
      );
    };
  });
  await page.getByRole("button", { name: "日程日历", exact: true }).click();
  await page.getByLabel("跳转日期").fill("2026-09-24");
  await page.locator('summary[aria-label="日历更多操作"]').click();
  await page.getByRole("button", { name: "同步本月课表", exact: true }).click();
  await page
    .getByText("测试课程（合成数据）", { exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "教务服务", exact: true }).click();
  await page.getByRole("button", { name: "成绩查询", exact: true }).click();
  await page.getByLabel("学年", { exact: true }).fill("2026-2027");
  await page.getByRole("button", { name: "查询成绩", exact: true }).click();
  await page.getByRole("cell", { name: "88", exact: true }).waitFor();
  await page.getByRole("button", { name: "教室查询", exact: true }).click();
  const roomSelects = page.locator(".room-filters select");
  for (let i = 0; i < 2; i++) {
    await roomSelects
      .nth(i)
      .locator('option[value="test"]')
      .waitFor({ state: "attached" });
    await roomSelects.nth(i).selectOption("test");
  }
  const floorProgress = page.getByRole("progressbar", { name: "已查询楼层" });
  await floorProgress.waitFor();
  assert.equal(await floorProgress.getAttribute("max"), "1");
  const roomProgress = page.getByRole("progressbar", { name: "已查询教室" });
  await roomProgress.and(page.locator('progress[value="2"]')).waitFor();
  assert.equal(await roomProgress.getAttribute("max"), "3");
  await page.getByLabel("查看时间（北京时间）").fill("08:30");
  await page
    .locator('.room-card[data-status="busy"] summary')
    .getByText("合成教室占用", { exact: true })
    .waitFor();
  await page
    .locator('.room-card[data-status="free"]')
    .getByText("合成 102", { exact: true })
    .waitFor();
  await page
    .locator('.room-card[data-status="unknown"]')
    .getByText("合成 103", { exact: true })
    .waitFor();
  await roomProgress.waitFor({ state: "hidden" });
  ok("楼层和教室显示实际查询进度，部分请求失败仍结束进度");
  await page.getByLabel("查看时间（北京时间）").fill("09:00");
  await page
    .locator('.room-card[data-status="free"]')
    .getByText("合成 101", { exact: true })
    .waitFor();
  ok("校园响应合成测试：成绩、楼栋状态、用途与时段边界");
  await page.getByLabel("查看时间（北京时间）").fill("08:30");
  await page.screenshot({ path: path.join(output, "room-board-v625.png") });
  await page.getByRole("button", { name: "日程日历", exact: true }).click();
  await page.getByLabel("跳转日期").fill(beijingDay(assignmentDeadline));
  await page
    .locator(".calendar-event.is-assignment")
    .getByRole("heading", { name: "合成学习通截止", exact: true })
    .waitFor();
  ok("学习通明确截止自动进入日历，无需先加入任务");
  await app.evaluate(({ session }) => {
    const learning = session.fromPartition("medstack-learning");
    learning.protocol.handle("https", async (request) => {
      const { pathname } = new URL(request.url);
      const html = (body) => new Response(body, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (pathname === "/mooc2/work/task" && request.method === "GET")
        return html('<h1>合成作答页</h1><form method="post" action="/fixture-submit" enctype="multipart/form-data"><label>附件<input type="file" name="file"></label><button>提交合成作业</button></form>');
      if (pathname === "/fixture-submit" && request.method === "POST") {
        const file = (await request.formData()).get("file");
        if (file?.name === "fixture.txt" && await file.text() === "fixture")
          return html("<h1>合成提交回执</h1>");
      }
      return new Response("", { status: 404 });
    });
  });
  await page.getByRole("button", { name: "超星学习通", exact: true }).click();
  const officialWindow = app.waitForEvent("window");
  await page.getByRole("button", { name: "前往作答与提交", exact: true }).click();
  const work = await officialWindow;
  await work.getByRole("heading", { name: "合成作答页" }).waitFor();
  assert.match(work.url(), /workId=3/);
  await work.getByLabel("附件").setInputFiles({
    name: "fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("fixture"),
  });
  await work.getByRole("button", { name: "提交合成作业" }).click();
  await work.getByRole("heading", { name: "合成提交回执" }).waitFor();
  await work.close();
  ok("官方作业入口合成测试：手动选附件、提交和确认回执");
  await page.getByRole("button", { name: "日程日历", exact: true }).click();
  await app.evaluate(({ session }) => {
    session.fromPartition("veritas-school").fetch = async () =>
      new Response("unavailable", { status: 500 });
  });
  await page.locator('summary[aria-label="日历更多操作"]').click();
  await page.getByRole("button", { name: "同步本月课表", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "HTTP 500" }).waitFor();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.courses.length, 1);
  ok("校园响应合成测试：课表解析、同步失败保留缓存");
  await page.getByRole("button", { name: "教务服务", exact: true }).click();
  await page.getByRole("button", { name: "学校连接", exact: true }).click();
  await page.getByLabel("学校账号（可选）").fill("synthetic-user");
  await page.getByLabel("学校密码（可选）").fill("synthetic-password");
  await page.getByRole("button", { name: "保存登录设置", exact: true }).click();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.campusAuth.hasCredentials, true);
  assert.ok(!JSON.stringify(state).includes("synthetic-password"));
  assert.ok(
    !fs
      .readFileSync(path.join(fixtureProfile(dataDir), "campus-vault.bin"))
      .includes("synthetic-password"),
  );
  ok("真实 Windows 加密保存，界面状态不泄露账号密码");
  await app.evaluate(async ({ session }) => {
    await session.fromPartition("veritas-school").cookies.set({
      url: "https://webvpn2.shsmu.edu.cn/",
      name: "veritas-synthetic-test",
      value: "synthetic-session",
      secure: true,
      httpOnly: true,
    });
  });
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  await page.getByRole("button", { name: "早晚报与推送", exact: true }).click();
  await page.getByLabel("快报预览日期").fill("2026-09-24");
  await page
    .getByText("测试课程（合成数据）", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    path: path.join(output, "06-briefing.png"),
    fullPage: true,
  });
  const feed = JSON.parse(
    fs.readFileSync(
      path.join(fixtureProfile(dataDir), "briefing", "veritas-feed.json"),
    ),
  );
  assert.equal(feed.tasks.length, 1);
  assert.equal(feed.tasks[0].due_time, "17:30");
  assert.equal(feed.timetable.verified_dates.length, 30);
  assert.ok(!JSON.stringify(feed).includes("synthetic-user"));
  ok("课表、未完成四象限任务和截止钟点进入快报，账号被排除");
  const exported = path.join(dataDir, "export.json");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exported);
  await page.evaluate(() => window.veritas.call("export.backup"));
  assert.ok(fs.existsSync(exported));
  assert.equal(JSON.parse(fs.readFileSync(exported)).tasks.length, 2);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, exported);
  await page.evaluate(() => window.veritas.call("import.backup"));
  assert.ok(
    fs.readdirSync(fixtureProfile(dataDir)).some((f) => /^backup-/.test(f)),
  );
  ok("完整备份导出与恢复，恢复前自动备份");
  await page.getByRole("button", { name: "设置与数据" }).click();
  await page.getByRole("tab", { name: "帮助", exact: true }).click();
  await page.getByRole("button", { name: "使用说明", exact: true }).click();
  await page
    .getByRole("dialog", { name: "医栈通 手册" })
    .getByRole("heading", { name: /医栈通 V\d/ })
    .waitFor();
  await page
    .getByRole("dialog", { name: "医栈通 手册" })
    .getByRole("button", { name: "开发者手册" })
    .click();
  await page
    .getByRole("dialog", { name: "医栈通 手册" })
    .getByRole("heading", { name: /医栈通 V\d/ })
    .waitFor();
  await page.getByRole("button", { name: "关闭手册" }).click();
  ok("使用说明与开发者手册内嵌显示");
  await page.getByRole("tab", { name: "专注与提醒", exact: true }).click();
  await page.getByLabel("每日专注目标（分钟）").fill("180");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.settings.dailyGoal, 180);
  ok("设置保存");
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.close();
  });
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    false,
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show(),
  );
  ok("关闭到托盘，窗口恢复");
  await page.getByRole("button", { name: "四象限", exact: true }).click();
  await page.screenshot({ path: path.join(output, "03-matrix.png") });
  assert.deepEqual(errors, []);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  ok("页面无未捕获错误、无横向溢出");
  await app.close();
  app = await launchAuthenticated(launchOptions);
  page = await app.firstWindow();
  await page.getByRole("heading", { name: "今天的安排" }).waitFor();
  state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.tasks.length, 2);
  assert.equal(state.logs.length, 2);
  assert.equal(state.settings.dailyGoal, 180);
  assert.equal(state.campusAuth.hasCredentials, true);
  const restoredCookies = await app.evaluate(async ({ session }) =>
    session
      .fromPartition("veritas-school")
      .cookies.get({ name: "veritas-synthetic-test" }),
  );
  assert.equal(restoredCookies[0]?.value, "synthetic-session");
  await page.evaluate(() => window.veritas.call("school.logout"));
  assert.equal(
    fs.existsSync(path.join(fixtureProfile(dataDir), "campus-vault.bin")),
    false,
  );
  ok("关闭与重启后任务、记录、设置保持");
  fs.writeFileSync(
    path.join(output, "desktop-results.json"),
    JSON.stringify(
      {
        passed: true,
        checks,
        screenshots: "All data shown in test screenshots is synthetic.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (app) {
    const page = (await app.windows())[0];
    if (page) {
      console.log(
        "FAILURE SCREEN:",
        (await page.locator("body").innerText()).slice(-6000),
      );
      await page.screenshot({ path: path.join(output, "failure.png") });
    }
  }
  throw error;
} finally {
  if (app)
    await app.close(); /* Keep isolated test data for investigation; never touch user data. */
}
