import path from "node:path";
import * as asar from "@electron/asar";
export function verifyPackagedRenderer(archive) {
  const html = asar.extractFile(archive, "dist/index.html").toString("utf8");
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
  ].map((x) => x[1]);
  if (!scripts.length) throw Error("发行包缺少界面入口脚本");
  for (const url of scripts) {
    if (/^[a-z]+:|^\/\//i.test(url)) throw Error("界面入口必须包含在安装包内");
    const file = url.split(/[?#]/)[0].replace(/^\.\//, "").replace(/^\//, "");
    if (
      file.split("/").includes("..") ||
      !asar.extractFile(archive, path.join("dist", file)).length
    )
      throw Error("发行包缺少界面脚本");
  }
  return { scripts: scripts.length };
}
