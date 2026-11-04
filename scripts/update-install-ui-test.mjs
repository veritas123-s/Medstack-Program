import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { launchAuthenticated } from "./account-test-fixture.mjs";
const env = {
  ...process.env,
  VERITAS_TEST: "1",
  VERITAS_TEST_DATA: fs.mkdtempSync(
    path.join(os.tmpdir(), "medstack-update-install-ui-"),
  ),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchAuthenticated({
  executablePath: path.resolve(process.argv[2]),
  args: [],
  env,
});
try {
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  const nextVersion = `${version.split(".")[0]}.999.0`;
  const page = await app.firstWindow();
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await app.evaluate(({ net }, version) => {
    const original = net.fetch.bind(net);
    net.fetch = async (url, options) =>
      new URL(url).pathname === "/api/releases/latest"
        ? Response.json({
            schema: 1,
            version,
            publishedAt: "2026-01-01T00:00:00Z",
            title: `医栈通 V${version}`,
            notes: ["不安装，只验证拒绝错误哈希"],
            downloads: {
              windows: {
                url: `https://github.com/veritas123-s/Medstack-Program/releases/download/v${version}/Medstack-Setup-${version}-x64.exe`,
                sha256: "0".repeat(64),
              },
            },
          })
        : original(url, options);
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (!String(url).includes(`/releases/download/v${version}/`))
        return originalFetch(url, options);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16500));
            global.finishUpdateFixture = () => {
              controller.enqueue(new Uint8Array(133500));
              controller.close();
            };
          },
        }),
        { headers: { "Content-Length": "150000" } },
      );
    };
  }, nextVersion);
  await page.evaluate(() => window.veritas.call("updates.check"));
  const banner = page.getByRole("region", { name: "版本更新" });
  const win = await app.browserWindow(page);
  await win.evaluate((window) => {
    window.setMinimumSize(640, 480);
    window.setContentSize(1120, 700);
  });
  await banner.waitFor();
  assert.equal((await banner.innerText()).split(nextVersion).length, 2);
  const detail = banner.getByText("更新内容", { exact: true });
  await detail.click();
  await banner.getByText("不安装，只验证拒绝错误哈希").waitFor();
  await detail.click();
  assert.ok((await banner.boundingBox()).height < 66);
  const install = banner.getByRole("button", { name: "一键更新", exact: true });
  await install.click();
  await banner.getByText("下载中 11%", { exact: true }).waitFor();
  assert.equal(
    await banner.getByRole("progressbar").getAttribute("value"),
    "11",
  );
  assert.equal(await banner.getByRole("button").count(), 0);
  for (const width of [1120, 640]) {
    await win.evaluate((window, w) => window.setContentSize(w, 650), width);
    await page.waitForFunction((w) => innerWidth === w, width);
    assert.equal(
      await banner.evaluate((node) => node.scrollWidth - node.clientWidth),
      0,
    );
    await banner.screenshot({
      path: `test-results/update-progress-${width}.png`,
    });
  }
  await app.evaluate(() => global.finishUpdateFixture());
  await page
    .getByRole("alert")
    .filter({ hasText: "安装包校验失败" })
    .first()
    .waitFor();
  const status = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(status.updates.installation.phase, "error");
  assert.equal(status.account.authenticated, true);
  assert.ok(await install.isEnabled());
  await banner.getByRole("button", { name: "下载安装包" }).waitFor();
  await page.screenshot({ path: "test-results/update-install-validation.png" });
  fs.writeFileSync(
    "test-results/update-install-ui.json",
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        packaged: true,
        downloadProgress: true,
        compactWidths: [1120, 640],
        wrongHashRejected: true,
        appRemainedOpen: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS packaged one-click update, progress/error UI, wrong hash prevented exit/install",
  );
} finally {
  await app.close();
}
