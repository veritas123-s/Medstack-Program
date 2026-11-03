import { launchAuthenticated } from "./account-test-fixture.mjs";
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veritas-v12-"));
const output = path.join(root, "test-results");
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, VERITAS_TEST: "1", VERITAS_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const checks = [],
  errors = [],
  screenshots = [];
const ok = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
const call = (name, payload = {}) =>
  page.evaluate(
    ([name, payload]) => window.veritas.call(name, payload),
    [name, payload],
  );
const state = () => call("state");
async function start() {
  app = await launchAuthenticated({ args: [root], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible()) await tour.getByRole("button", {name:"跳过",exact:true}).click();
  await page.getByRole("heading", { name: "今天的安排" }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1400, 1000),
  );
}
async function go(name) {
  if (name === "快报与提醒") {
    await page.getByRole("button", { name: "设置与数据", exact: true }).click();
    await page.getByRole("button", { name: "早晚报与推送", exact: true }).click(); return;
  }
  await page.getByRole("button", { name, exact: true }).click();
}
async function workbench() {
  await page.getByRole("button", { name: "更换主题", exact: true }).click();
  await page.getByRole("heading", { name: "主题与小组件" }).waitFor();
}
async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  screenshots.push(name);
}
try {
  await start();
  await call("timer", { action: "start", mode: "stopwatch" });
  const before = await state(),
    backgrounds = [];
  for (const [id, name] of [
    ["monument", "鎏金殿堂"],
    ["paper", "晴日纸间"],
    ["midnight", "午夜星图"],
  ]) {
    await workbench();
    await go(`使用${name}主题`);
    await page.waitForFunction(
      (id) => document.documentElement.dataset.theme === id,
      id,
    );
    await page.waitForFunction(
      () => !document.querySelector(".theme-choice.selected").disabled,
    );
    assert.equal(
      await page
        .getByRole("button", { name: `使用${name}主题`, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    backgrounds.push(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    );
    await shot(`v12-${id}-themes.png`);
    await go("今日概览");
    await page.locator('.overview-schedule').waitFor();
    await shot(`v12-${id}-overview.png`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  assert.equal(new Set(backgrounds).size, 3);
  const after = await state();
  assert.equal(after.timer.status, "running");
  assert.equal(after.timer.startedAt, before.timer.startedAt);
  assert.equal(after.timer.activeSince, before.timer.activeSince);
  assert.equal(after.logs.length, 0);
  ok("三套主题即时切换，计时不中断，业务数据不重置");
  await call("timer", { action: "finish" });
  for (const [name, heading] of [
    ["四象限", "四象限"],
    ["专注空间", "专注空间"],
    ["教务服务", "教务服务"],
    ["快报与提醒", "快报"],
  ]) {
    await go(name);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.equal(await page.locator(".module-error").count(), 0);
    await shot(`v12-dark-${name}.png`);
  }
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  await page
    .getByRole("heading", { name: "设置", exact: true })
    .waitFor();
  await shot("v12-dark-settings.png");
  await workbench();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1100, 820),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await shot("v12-theme-1100.png");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1400, 1000),
  );
  await go("小组件");
  await go("隐藏本周投入");
  await go("添加随手记");
  await go("上移随手记");
  await page.getByLabel("随手记宽度", { exact: true }).selectOption("full");
  await go("今日概览");
  await page.locator("summary").filter({hasText:"小组件"}).click();
  await page
    .getByLabel("随手记内容")
    .fill("V1.2 合成测试便笺：一个独立的小组件。");
  await go("保存便笺");
  await page.getByRole("button", { name: "已保存", exact: true }).waitFor();
  assert.equal(
    await page.locator("[data-widget]").first().getAttribute("data-widget"),
    "quick-note",
  );
  assert.equal(await page.locator('[data-widget="week"]').count(), 0);
  assert.match(
    await page.locator('[data-widget="quick-note"]').getAttribute("class"),
    /size-full/,
  );
  await shot("v12-customized-widgets.png");
  const savedWorkspace = (await state()).workspace;
  assert.equal(
    savedWorkspace.widgetData["quick-note"].data.text,
    "V1.2 合成测试便笺：一个独立的小组件。",
  );
  ok("首页小组件增减、排序、宽度与独立内容保存");
  await workbench();
  await go("小组件");
  await go("隐藏随手记");
  await go("添加随手记");
  await go("今日概览");
  await page.locator("summary").filter({hasText:"小组件"}).click();
  assert.equal(
    await page.getByLabel("随手记内容").inputValue(),
    savedWorkspace.widgetData["quick-note"].data.text,
  );
  await call("workspace.reset");
  let current = await state();
  assert.equal(current.workspace.theme, "midnight");
  assert.deepEqual(current.workspace.widgetData, savedWorkspace.widgetData);
  await call("workspace.configure", { widgets: savedWorkspace.widgets });
  await call("settings", { ...current.settings, focusMinutes: 35 });
  assert.deepEqual((await state()).workspace, savedWorkspace);
  ok("隐藏、恢复默认布局与修改设置均保留主题和组件内容");
  const backup = path.join(dataDir, "platform-backup.json");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, backup);
  await call("export.backup");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(backup, "utf8")).workspace,
    savedWorkspace,
  );
  await call("workspace.configure", { theme: "paper" });
  await call("widget.configure", {
    id: "quick-note",
    version: 1,
    data: { text: "临时替换" },
  });
  await call("import.backup");
  assert.deepEqual((await state()).workspace, savedWorkspace);
  ok("完整备份导出和恢复包含主题、布局与小组件内容");
  await app.close();
  app = null;
  await start();
  await page.locator("summary").filter({hasText:"小组件"}).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "midnight",
  );
  assert.deepEqual((await state()).workspace, savedWorkspace);
  assert.equal(
    await page.getByLabel("随手记内容").inputValue(),
    savedWorkspace.widgetData["quick-note"].data.text,
  );
  ok("退出重开后自动恢复所选主题、布局和便笺");
  assert.deepEqual(errors, []);
  await call("widget.configure", {
    id: "quick-note",
    version: 2,
    data: { text: "模拟未来版本，不能丢失" },
  });
  await page.getByRole("heading", { name: "随手记暂时未能显示" }).waitFor();
  assert.equal(
    await page.locator('[data-widget="priority"] .module-error').count(),
    0,
  );
  await page.locator(".new-task").click();
  await page
    .getByLabel("任务名称", { exact: true })
    .fill("组件失败后仍可创建任务");
  await go("保存任务");
  assert.equal((await state()).tasks.length, 1);
  assert.equal(
    (await state()).workspace.widgetData["quick-note"].data.text,
    "模拟未来版本，不能丢失",
  );
  await shot("v12-widget-isolation.png");
  ok("组件数据版本不兼容时局部提示，其他组件与任务仍正常，原数据保留");
  fs.writeFileSync(
    path.join(output, "platform-results.json"),
    JSON.stringify(
      {
        passed: true,
        checks,
        screenshots,
        isolatedData: true,
        syntheticData: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fs.writeFileSync(
    path.join(output, "platform-results.json"),
    JSON.stringify({ passed: false, checks, error: error.message }, null, 2),
  );
  throw error;
} finally {
  if (app) await app.close();
}
