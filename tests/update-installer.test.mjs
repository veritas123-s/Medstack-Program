import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  UpdateInstaller,
  installerURL,
  trashOldUpdateDownloads,
  updateWorker,
  waitForWorker,
} from "../electron/update-installer.mjs";
test("新版只清理更新目录中的已知旧版下载，保留新版、其他文件与备份", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-cleanup-"));
  try {
    const files = [
      "updates/6.2.1/Medstack-Setup-6.2.1-x64.exe",
      "updates/6.2.1/worker-ready.json",
      "updates/6.2.1/keep.txt",
      "updates/6.2.4/Medstack-Setup-6.2.4-x64.exe",
      "updates/6.3.0/Medstack-Setup-6.3.0-x64.exe",
      "upgrade-backups/6.2.1/Medstack-Setup-6.2.1-x64.exe",
    ];
    for (const file of files) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "synthetic");
    }
    const profileAlias = path.join(directory, "profile-alias");
    fs.symlinkSync(directory, profileAlias, process.platform === "win32" ? "junction" : "dir");
    const removed = [];
    await trashOldUpdateDownloads(profileAlias, "6.2.4", async (file) => {
      removed.push(path.basename(file));
      fs.unlinkSync(file);
    });
    assert.deepEqual(removed.sort(), [
      "Medstack-Setup-6.2.1-x64.exe",
      "worker-ready.json",
    ]);
    assert.ok(
      files.slice(2).every((file) => fs.existsSync(path.join(directory, file))),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
const payload = Buffer.alloc(150000, 65);
const release = {
  schema: 1,
  version: "5.3.0",
  publishedAt: "2026-01-01T00:00:00Z",
  title: "合成更新",
  notes: ["合成"],
  downloads: {
    windows: {
      url: "https://github.com/veritas123-s/Medstack-Program/releases/download/v5.3.0/Medstack-Setup-5.3.0-x64.exe",
      sha256: createHash("sha256").update(payload).digest("hex"),
    },
  },
};
test("一键更新只接受指定仓库、更高版本与正确哈希；失败不退出", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "medstack-updater-test-"),
  );
  let exits = 0;
  const updater = new UpdateInstaller({
    directory,
    version: "5.2.2",
    executable: path.join(directory, "program", "Medstack.exe"),
    packaged: true,
    fetcher: async () => new Response(payload),
    exit: async () => {
      exits++;
    },
  });
  try {
    if (!updater.state.supported) return;
    await assert.rejects(
      updater.install({
        ...release,
        downloads: {
          windows: { ...release.downloads.windows, sha256: "0".repeat(64) },
        },
      }),
      /校验/,
    );
    assert.equal(exits, 0);
    assert.equal(updater.status().phase, "error");
    assert.throws(() =>
      installerURL(
        "https://release-assets.githubusercontent.com.evil.invalid/x",
      ),
    );
    await assert.rejects(updater.install({ ...release, version: "5.2.2" }));
    assert.equal(exits, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("校验后才调用保存退出与独立安装器，工作脚本使用固定参数且保留备份", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "medstack-updater-test-"),
  );
  const sequence = [];
  const updater = new UpdateInstaller({
    directory,
    version: "5.2.2",
    executable: path.join(directory, "program", "Medstack.exe"),
    packaged: true,
    fetcher: async (_url, o) => {
      assert.equal(o.credentials, "omit");
      sequence.push("download");
      return new Response(payload);
    },
    exit: async (launch) => {
      sequence.push("persist");
      await launch();
      sequence.push("exit");
    },
    launch: (_shell, args, options) => {
      sequence.push("launch");
      assert.ok(args.includes("//B"));
      assert.equal(options.windowsHide, true);
      assert.equal(options.detached, true);
      const launcher = fs.readFileSync(args.at(-1), "utf16le");
      assert.match(launcher, /-NonInteractive/);
      assert.match(launcher, /, 0, True/);
      const worker = fs.readFileSync(
        path.join(path.dirname(args.at(-1)), "install-update.ps1"),
        "utf8",
      );
      assert.match(worker, /Backup verification failed/);
      assert.match(worker, /\$backupVerified -and \$installerStarted/);
      assert.match(worker, /Personal data changed/);
      const child = new EventEmitter();
      child.pid = 12345;
      child.kill = () => {};
      child.unref = () => {};
      const token = worker.match(/token='([a-f0-9]{32})'/)[1];
      fs.writeFileSync(
        path.join(path.dirname(args.at(-1)), "worker-ready.json"),
        JSON.stringify({ token, pid: child.pid }),
      );
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  });
  try {
    if (!updater.state.supported) return;
    await updater.install(release);
    assert.deepEqual(sequence, ["download", "persist", "launch", "exit"]);
    assert.equal(updater.status().phase, "installing");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("安装脚本拒绝非法PID、校验和与应用名称", () => {
  assert.throws(() =>
    updateWorker({ pid: 0, sha256: "a".repeat(64), version: "5.3.0" }),
  );
});

test("更新脚本提前退出或没有确认时拒绝退出主程序", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-handoff-"));
  try {
    for (const earlyExit of [true, false]) {
      const child = new EventEmitter();
      let killed = false;
      child.pid = 888;
      child.kill = () => {
        killed = true;
      };
      const pending = waitForWorker(
        child,
        path.join(directory, "ready.json"),
        "a".repeat(32),
        150,
      );
      if (earlyExit) queueMicrotask(() => child.emit("exit", 1));
      await assert.rejects(pending, /应用已保留/);
      assert.ok(killed);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("无关进程或旧确认文件不能触发退出", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "medstack-handoff-"));
  try {
    const child = new EventEmitter();
    child.pid = 888;
    child.kill = () => {};
    const ready = path.join(directory, "ready.json");
    fs.writeFileSync(
      ready,
      JSON.stringify({ token: "a".repeat(32), pid: 999 }),
    );
    await assert.rejects(
      waitForWorker(child, ready, "a".repeat(32), 150),
      /应用已保留/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
