import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { _electron as electron } from "playwright";
import {
  launchAuthenticated,
  clearSyntheticSession,
} from "./account-test-fixture.mjs";

if (process.platform !== "darwin")
  throw Error("macOS package verification requires macOS");
const pkg = JSON.parse(fs.readFileSync("package.json"));
const arch = process.env.MEDSTACK_EXPECTED_ARCH || process.arch;
assert.equal(
  process.arch,
  arch,
  "Verification must run on the native target architecture",
);
const dmg = path.resolve(
  pkg.build.directories.output,
  `Medstack-${pkg.version}-macOS-${arch}.dmg`,
);
const output = path.resolve("test-results/macos");
fs.mkdirSync(output, { recursive: true });
const mount = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-dmg-"));
const installed = path.join(
  process.env.RUNNER_TEMP || os.tmpdir(),
  "medstack-installed",
);
const target = path.join(installed, "Medstack.app");
if (fs.existsSync(target))
  throw Error("Synthetic install directory already exists");
execFileSync("hdiutil", ["verify", dmg], { stdio: "inherit" });
execFileSync(
  "hdiutil",
  ["attach", dmg, "-readonly", "-nobrowse", "-mountpoint", mount],
  { stdio: "inherit" },
);
try {
  assert.ok(
    fs.existsSync(path.join(mount, "Applications")),
    "DMG must offer the Applications shortcut",
  );
  fs.mkdirSync(installed, { recursive: true });
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", path.join(mount, "Medstack.app")],
    { stdio: "inherit" },
  );
  // ditto preserves framework-relative symlinks and signing extended attributes.
  execFileSync("ditto", [path.join(mount, "Medstack.app"), target], {
    stdio: "inherit",
  });
} finally {
  execFileSync("hdiutil", ["detach", mount], { stdio: "inherit" });
}
execFileSync("codesign", ["--verify", "--deep", "--strict", target], {
  stdio: "inherit",
});
const signatureResult = spawnSync("codesign", ["-dv", "--verbose=4", target], {
  encoding: "utf8",
});
assert.equal(signatureResult.status, 0);
const signature = signatureResult.stderr;
assert.ok(signature.includes("Signature=adhoc"));
assert.equal(
  execFileSync(
    "/usr/libexec/PlistBuddy",
    [
      "-c",
      "Print :LSMinimumSystemVersion",
      path.join(target, "Contents/Info.plist"),
    ],
    { encoding: "utf8" },
  ).trim(),
  "13.0",
);
const executable = path.join(target, "Contents/MacOS/Medstack");
assert.ok(
  execFileSync("lipo", ["-archs", executable], { encoding: "utf8" }).includes(
    arch === "x64" ? "x86_64" : arch,
  ),
);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-mac-smoke-"));
const env = { ...process.env, VERITAS_TEST: "1", VERITAS_TEST_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
const options = { executablePath: executable, args: [], env };
let app;
const checks = [];
try {
  app = await electron.launch(options);
  let page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "登录 医栈通", exact: true })
    .waitFor();
  const locked = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(locked.account.authenticated, false);
  for (const field of [
    "tasks",
    "logs",
    "events",
    "courses",
    "research",
    "workspace",
    "settings",
  ])
    assert.equal(
      Object.hasOwn(locked, field),
      false,
      `Locked snapshot leaked ${field}`,
    );
  await page.screenshot({ path: path.join(output, `login-${arch}.png`) });
  const native = await app.evaluate(({ app, Menu }) => ({
    arch: process.arch,
    roles: Menu.getApplicationMenu().items.flatMap(
      (menu) => menu.submenu?.items.map((item) => item.role) || [],
    ),
    name: app.getName(),
  }));
  assert.equal(native.arch, arch);
  assert.equal(
    native.name,
    "Medstack",
    "Keychain application name must not contain the version",
  );
  for (const role of ["quit", "copy", "paste", "undo", "services"])
    assert.ok(native.roles.includes(role), role);
  const help = await page.evaluate(() =>
    window.veritas.call("help.read", { kind: "user" }),
  );
  assert.ok(help.text.includes("医栈通"));
  checks.push(
    "Native architecture, mounted DMG, deep code signature, login privacy gate, native menus and bundled help",
  );
  await app.close();
  app = await launchAuthenticated(options);
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    false,
  );
  await app.evaluate(({ app }) => app.emit("activate"));
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    true,
  );
  const state = await page.evaluate(() => window.veritas.call("state"));
  assert.equal(state.account.authenticated, true);
  assert.equal(state.updates.platform, `macos_${arch}`);
  await page.screenshot({ path: path.join(output, `workspace-${arch}.png`) });
  const tour = page.getByRole("dialog", { name: "医栈通 新手教程" });
  if (await tour.isVisible())
    await tour.getByRole("button", { name: "跳过", exact: true }).click();
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  await page.getByRole("tab", { name: "关于", exact: true }).click();
  await page
    .getByText("开发者 · 交叉学科创协Medtrix工作室", { exact: true })
    .waitFor();
  assert.ok(await page.getByRole("img", { name: "交叉学科创协", exact: true })
    .evaluate((element) => element.naturalWidth > 0));
  assert.equal(await page.getByText(/MySHSMU|酱紫办/).count(), 0);
  await page.screenshot({ path: path.join(output, `about-${arch}.png`) });
  checks.push("About page retains Medtrix and removes obsolete campus attribution");
  checks.push(
    "Authenticated workspace, close/reopen from Dock, matching update architecture",
  );
  await clearSyntheticSession(app);
  fs.writeFileSync(
    path.join(output, "result.json"),
    JSON.stringify(
      { version: pkg.version, arch, checks, notarized: false, signature },
      null,
      2,
    ),
  );
} catch (error) {
  if (app) {
    const windows = app.windows();
    if (windows.length)
      await windows[0]
        .screenshot({ path: path.join(output, `failure-${arch}.png`) })
        .catch(() => {});
  }
  fs.writeFileSync(
    path.join(output, "failure.txt"),
    error.stack || error.message,
  );
  throw error;
} finally {
  if (app) await app.close();
}
