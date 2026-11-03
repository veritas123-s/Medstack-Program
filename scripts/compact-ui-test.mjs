import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { launchAuthenticated } from "./account-test-fixture.mjs";
import { THEMES } from "../src/themes/catalog.mjs";
const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-compact-"));
const env = { ...process.env, VERITAS_TEST: "1", VERITAS_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchAuthenticated({
  ...(process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [] }
    : { args: [root] }),
  env,
});
const results = [];
try {
  const page = await app.firstWindow();
  await app.evaluate(({ net }) => {
    const previous = net.fetch.bind(net);
    net.fetch = async (url, options) => {
      if (new URL(url).pathname === "/api/releases/preferences")
        return Response.json({ emailUpdates: false });
      return previous(url, options);
    };
  });
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await page.evaluate(async () => {
    const quadrants = ["do", "plan", "delegate", "later"];
    for (let i = 0; i < 12; i++)
      await window.veritas.call("task.save", {
        title: `模拟学习任务 ${i + 1}`,
        project: "学习",
        quadrant: quadrants[i % 4],
        due: new Date().toLocaleDateString("en-CA"),
        notes: "合成界面测试",
      });
    await window.veritas.call("log.add", {
      title: "模拟专注",
      project: "学习",
      start: new Date(Date.now() - 60 * 60000).toISOString(),
      end: new Date(Date.now() - 35 * 60000).toISOString(),
    });
  });
  async function open(title, heading = title) {
    if (title === "账号与同步") {
      await page
        .locator(".topbar")
        .getByRole("button", { name: title, exact: true })
        .click();
    } else if (title === "快报与提醒") {
      await page
        .locator(".sidebar")
        .getByRole("button", { name: "设置与数据", exact: true })
        .click();
      await page
        .getByRole("button", { name: "早晚报与推送", exact: true })
        .click();
    } else {
      await page
        .locator(".sidebar button:not(.nav-group-button)")
        .filter({ hasText: title })
        .first()
        .click();
    }
    await page
      .getByRole("heading", { name: heading, exact: true })
      .first()
      .waitFor();
    await page.locator("main.page-viewport").waitFor();
    await page.waitForTimeout(100);
  }
  async function measure(label, strict = true) {
    const value = await page.evaluate(() => {
      const main = document.querySelector("main.page-viewport");
      return {
        body: document.documentElement.scrollHeight - innerHeight,
        main: main.scrollHeight - main.clientHeight,
        horizontal: document.documentElement.scrollWidth - innerWidth,
      };
    });
    results.push({ label, width: (await page.viewportSize()).width, ...value });
    assert.ok(
      value.body <= 1 && value.horizontal <= 1,
      `${label}: outer overflow ${JSON.stringify(value)}`,
    );
    if (strict)
      assert.ok(
        value.main <= 1,
        `${label}: page needs scrolling ${value.main}`,
      );
  }
  for (const size of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    for (const [title, heading] of [
      ["今日概览", "今天的安排"],
      ["日程日历", "日程日历"],
      ["任务清单", "任务清单"],
      ["四象限", "四象限"],
      ["专注空间", "专注空间"],
      ["时间记录", "时间记录"],
      ["设置与数据", "设置"],
      ["教务服务", "教务服务"],
      ["超星学习通", "超星学习通"],
      ["校园快讯", "校园快讯"],
      ["校园快讯", "校园快讯"],
      ["快报与提醒", "快报"],
      ["账号与同步", "账号与同步"],
      ["主题与小组件", "主题与小组件"],
    ]) {
      await open(title, heading);
      await measure(title);
      if (size.width === 1366)
        await page.screenshot({
          path: path.join(root, `test-results/compact-${title}.png`),
        });
    }
    for (const title of ["背景与配色", "小组件", "模块"]) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await measure(`外观/${title}`, title !== "背景与配色");
    }
    await open("设置与数据", "设置");
    for (const tab of await page.locator(".settings-tabs button").all()) {
      await tab.click();
      await measure(`设置/${await tab.innerText()}`, false);
    }
    await open("日程日历");
    for (const title of ["年", "日", "月"]) {
      await page
        .getByRole("group", { name: "日历视图" })
        .getByRole("button", { name: title, exact: true })
        .click();
      await measure(`日历/${title}`);
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const theme of THEMES) {
    await page.evaluate(
      (id) => window.veritas.call("workspace.configure", { theme: id }),
      theme.id,
    );
    await open("今日概览", "今天的安排");
    await measure(`主题/${theme.name}`);
  }
  await page.evaluate(async () => {
    for (let i = 0; i < 50; i++)
      await window.veritas.call("task.save", {
        title: `模拟长列表任务 ${i + 1}`,
        project: "学习",
        quadrant: "do",
      });
  });
  await open("任务清单");
  await measure("62条任务");
  assert.ok(
    await page
      .locator(".task-list")
      .evaluate((el) => el.scrollHeight > el.clientHeight),
    "Long tasks must scroll inside their own list",
  );
  await open("四象限");
  await measure("长列表四象限");
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  assert.equal(await page.locator(".sidebar nav > button").count(), 5);
  await measure("收起侧栏");
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await open("专注空间");
  await page.locator(".quick-log summary").click();
  assert.ok(await page.getByLabel("补记分钟", { exact: true }).isVisible());
  await page.getByLabel("补记分钟", { exact: true }).fill("15");
  await page
    .getByLabel("补记结束时间", { exact: true })
    .fill(
      new Date(Date.now() - 100 * 60000)
        .toLocaleString("sv-SE")
        .slice(0, 16)
        .replace(" ", "T"),
    );
  await page.getByRole("button", { name: "保存补记", exact: true }).click();
  await page
    .locator(".quick-log")
    .getByText("已保存", { exact: true })
    .waitFor();
  await measure("展开补记");
  fs.writeFileSync(
    path.join(root, "test-results/compact-layout.json"),
    JSON.stringify({ passed: true, syntheticTasks: 62, results }, null, 2),
  );
  console.log(
    `PASS: ${results.length} layout checks, eight themes, 62 tasks, manual log, collapsed navigation.`,
  );
} catch (error) {
  const page = await app.firstWindow();
  await page.screenshot({
    path: path.join(root, "test-results/compact-failure.png"),
  });
  fs.writeFileSync(
    path.join(root, "test-results/compact-layout.json"),
    JSON.stringify({ passed: false, results, error: error.message }, null, 2),
  );
  throw error;
} finally {
  await app.close();
}
