import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { launchAuthenticated } from "./account-test-fixture.mjs";
const env = {
  ...process.env,
  VERITAS_TEST: "1",
  VERITAS_TEST_DATA: fs.mkdtempSync(
    path.join(os.tmpdir(), "medstack-exams-ui-"),
  ),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchAuthenticated({
  executablePath: path.resolve(process.argv[2]),
  args: [],
  env,
});
try {
  const page = await app.firstWindow();
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await app.evaluate(async ({ session }) => {
    const ses = session.fromPartition("veritas-school");
    await ses.cookies.set({
      url: "https://webvpn2.shsmu.edu.cn",
      name: "synthetic-school-session",
      value: "not-valid-at-school",
    });
    ses.protocol.handle(
      "https",
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><h1>考试安排</h1><select id="Grade"><option selected>2024-2025学年</option></select><select id="Semester"><option selected>第一学期</option></select><table><tr><th>考试课程</th><th>考试时间</th><th>考试地点</th></tr><tr><td>合成考试课程</td><td>10月17日(周四)09:00--10:30</td><td>西区合成教室</td></tr></table>',
          { headers: { "Content-Type": "text/html;charset=utf-8" } },
        ),
    );
  });
  await page.evaluate(() => window.veritas.call("school.open"));
  await page.getByRole("button", { name: "校园与课表", exact: true }).click();
  await page.getByRole("button", { name: "考试查询", exact: true }).click();
  await page.getByRole("cell", { name: "合成考试课程", exact: true }).waitFor();
  const state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.exams.items.length, 1);
  assert.equal(
    state.events.filter((x) => x.calendarUid.startsWith("school-exam:")).length,
    1,
  );
  assert.equal(state.exams.items[0].start, "2024-10-17T09:00");
  const exam = state.events.find((x) =>
    x.calendarUid.startsWith("school-exam:"),
  );
  await page.evaluate(
    (id) => window.veritas.call("event.delete", { id }),
    exam.id,
  );
  await page.evaluate(() => window.veritas.call("school.exams"));
  const after = await page.evaluate(() => window.veritas.call("state"));
  assert.ok(after.events.find((x) => x.id === exam.id).deletedAt);
  fs.mkdirSync("test-results/exams", { recursive: true });
  await page.screenshot({ path: "test-results/exams/desktop.png" });
  console.log(
    "PASS isolated official-page DOM reader, exam table, schedule sync and deletion retention; synthetic school page only",
  );
} finally {
  await app.close();
}
