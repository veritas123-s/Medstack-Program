import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as asar from "@electron/asar";
import { verifyPackagedRenderer } from "../scripts/packaged-renderer.mjs";
test("发布前检查真实归档里的界面入口及脚本，缺少资源立即阻止发布", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "medstack-renderer-package-"),
  );
  try {
    const source = path.join(dir, "source");
    fs.mkdirSync(path.join(source, "dist/assets"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "dist/index.html"),
      '<script type="module" src="./assets/main.js"></script>',
    );
    const missing = path.join(dir, "missing.asar");
    await asar.createPackage(source, missing);
    assert.throws(() => verifyPackagedRenderer(missing));
    fs.writeFileSync(
      path.join(source, "dist/assets/main.js"),
      'document.body.textContent="合成界面";',
    );
    const good = path.join(dir, "complete.asar");
    await asar.createPackage(source, good);
    assert.equal(verifyPackagedRenderer(good).scripts, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
