import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { launchAuthenticated } from "./account-test-fixture.mjs";
const env = {
  ...process.env,
  VERITAS_TEST: "1",
  VERITAS_TEST_DATA: fs.mkdtempSync(
    path.join(os.tmpdir(), "medstack-retired-news-"),
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
  assert.equal(
    await page.getByRole("button", { name: "校园快讯", exact: true }).count(),
    0,
  );
  assert.equal(await page.getByText("校园快讯", { exact: true }).count(), 0);
  const state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.news.retired, true);
  assert.deepEqual(state.news.items, []);
  await assert.rejects(
    () => page.evaluate(() => window.veritas.call("news.collect")),
    /已取消/,
  );
  await page.getByRole("button", { name: "超星学习通", exact: true }).click();
  await page
    .getByRole("heading", { name: "超星学习通", exact: true })
    .waitFor();
  fs.mkdirSync("test-results/retired-news", { recursive: true });
  await page.screenshot({ path: "test-results/retired-news/learning.png" });
  console.log(
    "PASS no news route/card or collection, learning connector retained",
  );
} finally {
  await app.close();
}
