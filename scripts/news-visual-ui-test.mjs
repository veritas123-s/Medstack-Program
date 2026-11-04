import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {
  launchAuthenticated,
  fixtureProfile,
} from "./account-test-fixture.mjs";
import { initialState, validateState } from "../src/domain.mjs";
import { beijingDay } from "../src/briefing.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-news-visual-")),
  profile = fixtureProfile(directory);
fs.mkdirSync(profile, { recursive: true });
const state = initialState();
validateState(state);
fs.writeFileSync(
  path.join(directory, "veritas-data.json"),
  JSON.stringify(state),
);
fs.writeFileSync(
  path.join(profile, "campus-news.json"),
  JSON.stringify({
    version: 1,
    automatic: false,
    coverage: [],
    items: [
      {
        id: "synthetic-visual",
        title: "合成校园学术活动图文",
        excerpt: "合成活动摘要，测试原文封面、安全缩略图与自适应图文排版。",
        source: "合成新闻网",
        publishedAt: Date.now() - 60000,
        date: beijingDay(),
        url: "https://news.sjtu.edu.cn/synthetic",
        imageURL: "https://news.sjtu.edu.cn/synthetic-cover.jpg",
      },
      {
        id: "synthetic-no-cover",
        title: "合成无图通知",
        source: "合成组织",
        publishedAt: Date.now() - 120000,
        date: beijingDay(),
        url: "https://news.sjtu.edu.cn/without-cover",
      },
    ],
  }),
);
const env = { ...process.env, VERITAS_TEST: "1", VERITAS_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchAuthenticated(
  process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [], env }
    : { args: [root], env },
);
try {
  await app.evaluate(
    (_electron, encoded) => {
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) =>
        String(url) === "https://news.sjtu.edu.cn/synthetic-cover.jpg"
          ? Promise.resolve(
              new Response(Buffer.from(encoded, "base64"), {
                headers: { "content-type": "image/png" },
              }),
            )
          : original(url, options);
    },
    fs.readFileSync(path.join(root, "assets/icon.png")).toString("base64"),
  );
  const page = await app.firstWindow(),
    tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "校园快讯", exact: true })
    .click();
  const cover = page.locator(".news-cover img");
  await cover.waitFor();
  assert.ok(
    await cover.evaluate((img) => img.complete && img.naturalWidth > 32),
  );
  assert.ok(
    (await cover.getAttribute("src")).startsWith("data:image/jpeg;base64,"),
  );
  assert.equal(await page.locator(".news-cover:not(.has-cover):visible").count(), 1);
  const widths = [];
  for (const [width, height] of [
    [1600, 900],
    [1100, 760],
    [800, 680],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, height),
      { width, height },
    );
    await page.waitForTimeout(180);
    widths.push(
      await cover.evaluate((img) => img.getBoundingClientRect().width),
    );
    assert.ok(
      await page
        .locator(".page-viewport")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
    );
  }
  assert.ok(widths[0] > widths[2]);
  await page.getByLabel("搜索校园快讯").fill("无图");
  assert.equal(await page.locator(".recent-news-card").count(), 1);
  await page.getByLabel("搜索校园快讯").fill("");
  await page.getByRole("button", { name: "组织专栏", exact: true }).click();
  assert.equal(await page.locator(".news-article-row").count(), 2);
  assert.equal(
    await page.getByRole("button", { name: "当日活动", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText("核对活动日期", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "最近24小时", exact: true }).click();
  await page.getByText("来源与原文 · 1", { exact: true }).first().click();
  await page
    .locator(".recent-news-card")
    .first()
    .getByRole("button", { name: "删除", exact: true })
    .click();
  assert.equal(await page.locator(".recent-news-card").count(), 1);
  await page.getByRole("button", { name: "已删除", exact: true }).click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await page.getByRole("button", { name: "最近24小时", exact: true }).click();
  assert.equal(await page.locator(".recent-news-card").count(), 2);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1366, 768),
  );
  await page
    .evaluate(() =>
      window.veritas.call("workspace.configure", { theme: "paper" }),
    )
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({
    animations: "disabled",
    path: path.join(root, "test-results/news-visual.png"),
  });
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  await page.getByRole("tab", { name: "关于", exact: true }).click();
  await page
    .getByText("开发者 · 交叉学科创协Medtrix工作室", { exact: true })
    .waitFor();
  assert.ok(await page.getByRole("img", { name: "交叉学科创协", exact: true })
    .evaluate((element) => element.naturalWidth > 0));
  assert.equal(await page.getByText(/MySHSMU|酱紫办/).count(), 0);
  await page.getByRole("button", { name: "复制微信号", exact: true }).click();
  await page.getByText("微信号已复制", { exact: true }).waitFor();
  assert.equal(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    "Veritas_Enterprise",
  );
  await page.screenshot({
    animations: "disabled",
    path: path.join(root, "test-results/about-v522.png"),
  });
  fs.writeFileSync(
    path.join(root, "test-results/news-visual-ui.json"),
    JSON.stringify(
      {
        passed: true,
        widths,
        checks: [
          "真实主进程安全缩略图解码",
          "本地 data 图片呈现与无图回退",
          "三个窗口尺寸图文缩放无横向溢出",
          "标题摘要来源搜索",
          "组织专栏图文一致",
          "删除恢复不复活墓碑",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS campus image/text UI, safe thumbnails, adaptive widths, search, deletion and restore",
  );
} finally {
  await app.close();
}
