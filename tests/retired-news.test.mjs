import test from "node:test";
import assert from "node:assert/strict";
import { retiredNews } from "../electron/retired-news.mjs";
import execute from "../electron/commands/news.mjs";
test("取消快讯后不会启动采集或返回历史内容，旧命令拒绝执行", async () => {
  const service = retiredNews();
  service.start();
  service.stopForSwitch();
  service.stop();
  assert.deepEqual(service.status().items, []);
  assert.equal(service.status().retired, true);
  await assert.rejects(() => execute("news.collect", {}, {}), /已取消/);
  await assert.rejects(() => execute("news.import", {}, {}), /已取消/);
});
