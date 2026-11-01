import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyPackagedRenderer } from "./packaged-renderer.mjs";
import {
  validateRelease,
  releaseFilename,
  RELEASE_PLATFORMS,
} from "../src/releases.mjs";
const pkg = JSON.parse(fs.readFileSync("package.json")),
  version = pkg.version;
const notes = JSON.parse(
  fs.readFileSync(process.argv[2] || `releases/notes-${version}.json`),
);
const directory = path.resolve(pkg.build.directories.output),
  assets = [],
  downloads = {};
const platforms = notes.platforms || ["windows"];
if (platforms.includes("windows"))
  verifyPackagedRenderer(
    path.join(directory, "win-unpacked/resources/app.asar"),
  );
if (
  !Array.isArray(platforms) ||
  !platforms.length ||
  new Set(platforms).size !== platforms.length ||
  platforms.some((platform) => !RELEASE_PLATFORMS.includes(platform))
)
  throw Error("发行平台清单无效");
for (const platform of platforms) {
  const name = releaseFilename(version, platform);
  const file = path.join(directory, name),
    bytes = fs.readFileSync(file),
    sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.length < 100000) throw Error("发行包过小");
  assets.push({ name, bytes, sha256 });
  downloads[platform] = {
    url: `https://github.com/veritas123-s/Medstack-Program/releases/download/v${version}/${name}`,
    sha256,
  };
}
const prior = fs.existsSync("releases/stable.json")
  ? JSON.parse(fs.readFileSync("releases/stable.json"))
  : null;
const catalog = validateRelease({
  schema: 1,
  version,
  publishedAt:
    prior?.version === version ? prior.publishedAt : new Date().toISOString(),
  title: notes.title,
  notes: notes.notes,
  urgent: notes.urgent === true,
  downloads,
});
if (!process.argv.includes("--publish")) {
  console.log(
    JSON.stringify(
      {
        preview: catalog,
        assets: assets.map(({ name, bytes }) => ({
          name,
          bytes: bytes.length,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const remote = spawnSync("git", ["remote", "get-url", "origin"], {
  encoding: "utf8",
}).stdout.trim();
if (
  !/^https:\/\/github\.com\/veritas123-s\/Medstack-Program(?:\.git)?$/.test(
    remote,
  )
)
  throw Error("发布仓库不匹配");
const credentials = Object.fromEntries(
  spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  })
    .stdout.trim()
    .split(/\r?\n/)
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
const headers = {
  Authorization: "Bearer " + credentials.password,
  "User-Agent": "Medstack-release",
  "X-GitHub-Api-Version": "2022-11-28",
  Accept: "application/vnd.github+json",
};
const base = "https://api.github.com/repos/veritas123-s/Medstack-Program";
const api = async (route, options = {}) => {
  const r = await fetch(base + route, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw Error("GitHub发布操作失败 HTTP " + r.status);
  return r.json();
};
let release = await api("/releases/tags/v" + version);
if (!release)
  release = await api("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: "v" + version,
      target_commitish: "main",
      name: catalog.title,
      body: catalog.notes.map((n) => "- " + n).join("\n"),
      draft: true,
      prerelease: false,
    }),
  });
for (const asset of assets) {
  let found = release.assets.find((x) => x.name === asset.name);
  if (!found) {
    if (!release.draft) throw Error("已发布版本缺少文件，停止修改");
    const upload = new URL(release.upload_url.split("{")[0]);
    if (upload.hostname !== "uploads.github.com") throw Error("上传目标无效");
    upload.searchParams.set("name", asset.name);
    const r = await fetch(upload, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      body: asset.bytes,
      signal: AbortSignal.timeout(600000),
    });
    if (!r.ok) throw Error("安装包上传失败 HTTP " + r.status);
    found = await r.json();
  }
  if (
    found.size !== asset.bytes.length ||
    found.digest !== "sha256:" + asset.sha256
  )
    throw Error("发布附件校验失败，公告未发布");
}
if (release.draft)
  release = await api("/releases/" + release.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false }),
  });
fs.mkdirSync("releases", { recursive: true });
fs.writeFileSync(
  "releases/stable.json",
  JSON.stringify(catalog, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(directory, "SHA256SUMS.txt"),
  assets.map((a) => a.sha256 + "  " + a.name).join("\n") + "\n",
);
console.log(
  JSON.stringify({
    published: true,
    url: release.html_url,
    version,
    assets: assets.map((a) => a.name),
    catalog: "releases/stable.json",
  }),
);
credentials.password = "";
