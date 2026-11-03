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
  ...(process.argv[2]
    ? { executablePath: path.resolve(process.argv[2]), args: [] }
    : { args: [process.cwd()] }),
  env,
});
try {
  const page = await app.firstWindow();
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await app.evaluate(async ({ session }) => {
    const ses = session.fromPartition("veritas-school");
    let authenticated = false;
    ses.syntheticLogins = 0;
    ses.fetch = async () =>
      authenticated
        ? Response.json({ List: [] })
        : new Response(null, { status: 401 });
    const html = (body) =>
      new Response(body, {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    ses.protocol.handle("https", ({ url }) => {
      const u = new URL(url);
      if (u.pathname === "/synthetic-authenticated") {
        ses.syntheticLogins++;
        authenticated =
          u.searchParams.get("username") === "synthetic-user" &&
          u.searchParams.get("password") === "synthetic-password";
        return html("<h1>测试学校会话</h1>");
      }
      if (!authenticated || ses.syntheticChallenge) {
        const challenge = ses.syntheticChallenge
          ? '<label>验证码<input name="captcha"></label>'
          : "";
        return html(
          '<form action="/synthetic-authenticated"><input name="username"><input type="password" name="password">' +
            challenge +
            '<button type="submit">登录</button></form>',
        );
      }
      return html(
        '<!doctype html><meta charset="utf-8"><h1>考试安排</h1><select id="Grade"><option selected>2024-2025学年</option></select><select id="Semester"><option selected>第一学期</option></select><table><tr><th>考试课程</th><th>考试时间</th><th>考试地点</th></tr><tr><td>合成考试课程</td><td>10月17日(周四)09:00--10:30</td><td>西区合成教室</td></tr></table>',
      );
    });
  });
  await page.getByRole("button", { name: "教务服务", exact: true }).click();
  await page.getByRole("button", { name: "学校连接", exact: true }).click();
  await page.getByLabel("学校账号（可选）").fill("synthetic-user");
  await page.getByLabel("学校密码（可选）").fill("synthetic-password");
  await page.getByRole("button", { name: "保存登录设置", exact: true }).click();
  await page.evaluate(() =>
    Promise.all([
      window.veritas.call("school.exams"),
      window.veritas.call("school.courses", {
        start: "2024-10-01",
        end: "2024-11-01",
      }),
    ]),
  );
  assert.equal(
    await app.evaluate(
      ({ session }) => session.fromPartition("veritas-school").syntheticLogins,
    ),
    1,
  );
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  assert.equal(await page.locator('[data-calendar="unified"]').count(), 0);
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
  await app.evaluate(({ session }) => {
    session.fromPartition("veritas-school").syntheticChallenge = true;
  });
  await page.evaluate(() =>
    window.veritas.call("school.login.configure", { remember: true }),
  );
  await assert.rejects(
    () => page.evaluate(() => window.veritas.call("school.exams")),
    /学校要求验证/,
  );
  await page
    .getByRole("button", { name: "学校连接 · 待验证", exact: true })
    .waitFor();
  const expired = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(expired.exams.items.length, 1);
  assert.equal(
    await app.evaluate(
      ({ session }) => session.fromPartition("veritas-school").syntheticLogins,
    ),
    1,
  );
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  await page.getByRole("button", { name: "日程日历", exact: true }).click();
  await page.locator('[data-calendar="unified"]').waitFor();
  fs.mkdirSync("test-results/exams", { recursive: true });
  await page.screenshot({ path: "test-results/exams/desktop.png" });
  console.log(
    "PASS shared background login, exam calendar insertion/deletion, single calendar; synthetic school only",
  );
} finally {
  await app.close();
}
