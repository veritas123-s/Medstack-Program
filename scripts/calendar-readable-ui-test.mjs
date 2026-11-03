import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { launchAuthenticated } from "./account-test-fixture.mjs";
import { initialState } from "../src/domain.mjs";
import { beijingDay } from "../src/briefing.mjs";
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "medstack-calendar-readable-"),
);
const today = beijingDay(),
  state = initialState();
state.courses = [
  {
    title: "合成人体构造课程",
    start: today + "T08:00:00",
    end: today + "T09:30:00",
    location: "合成东区教室",
  },
];
fs.writeFileSync(
  path.join(directory, "veritas-data.json"),
  JSON.stringify(state),
);
const env = { ...process.env, VERITAS_TEST: "1", VERITAS_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchAuthenticated(
  process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [], env }
    : { args: [process.cwd()], env },
);
const results = [];
try {
  const page = await app.firstWindow();
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "日程日历", exact: true })
    .click();
  for (const width of [1440, 1100, 960, 800]) {
    await page.setViewportSize({ width, height: 720 });
    for (const view of ["月", "年", "日"]) {
      console.log(width, view);
      await page
        .getByRole("group", { name: "日历视图" })
        .getByRole("button", { name: view, exact: true })
        .click();
      await page.waitForTimeout(350);
      if (view === "月") {
        const cell = page.getByRole("button", {
          name: `${today}，0 项任务，1 节课程`,
          exact: true,
        });
        assert.equal(
          await cell.locator(".calendar-chip-title").textContent(),
          "合成人体构造课程",
        );
        assert.match(
          await cell.locator(".calendar-chip-time").textContent(),
          /08:00/,
        );
        const box = await cell.locator(".calendar-chip-title").boundingBox();
        assert.ok(
          box.width >= 30 && box.height >= 12,
          JSON.stringify({ width, box }),
        );
        assert.equal(await cell.locator(".course-dot").count(), 0);
        if (width === 1100)
          await page.screenshot({
            path: "test-results/calendar-readable-campus.png",
          });
      } else if (view === "年") {
        assert.equal(
          await page
            .locator(".calendar-day.today:not(.outside) .calendar-mini-count")
            .textContent(),
          "1课",
        );
      } else {
        await page
          .getByRole("heading", { name: "合成人体构造课程", exact: true })
          .waitFor();
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      results.push({ width, view, passed: true });
    }
  }
  fs.writeFileSync(
    "test-results/calendar-readable-ui.json",
    JSON.stringify({ passed: true, synthetic: true, results }, null, 2),
  );
  console.log("PASS course title/time visible; year counts; 12 layout cases");
} catch (error) {
  await (
    await app.firstWindow()
  ).screenshot({ path: "test-results/calendar-readable-failure.png" });
  throw error;
} finally {
  await app.close();
}
