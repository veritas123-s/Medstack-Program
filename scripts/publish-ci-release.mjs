import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RELEASE_PLATFORMS, releaseFilename, validateRelease } from "../src/releases.mjs";
import { publishVerifiedDraft } from "./release-draft.mjs";

const { GITHUB_REPOSITORY: repo, GITHUB_SHA: sha } = process.env;
assert.equal(repo, "veritas123-s/Medstack-Program");
assert.match(sha, /^[0-9a-f]{40}$/);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gh = (...args) => execFileSync("gh", args, {
  encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
});
const api = (route, method = "GET", body) => JSON.parse(
  execFileSync("gh", [
    "api", `repos/${repo}/${route}`, "--method", method,
    ...(body ? ["--input", "-"] : []),
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, input: body && JSON.stringify(body) }),
);

async function upload(release, asset) {
  const url = new URL(release.upload_url.split("{")[0]);
  assert.equal(url.origin, "https://uploads.github.com");
  assert.equal(url.pathname, `/repos/${repo}/releases/${release.id}/assets`);
  url.searchParams.set("name", asset.name);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/octet-stream",
    },
    body: fs.readFileSync(asset.file),
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw Error(`GitHub upload failed (${response.status}): ${asset.name}`);
  return response.json();
}
const { version } = read("package.json");
const notes = read(`releases/notes-${version}.json`);
assert.deepEqual([...notes.platforms].sort(), [...RELEASE_PLATFORMS].sort());

function download(id, workflow, artifact, destination) {
  assert.match(id, /^\d+$/);
  const run = api(`actions/runs/${id}`);
  assert.equal(run.path, `.github/workflows/${workflow}.yml`);
  assert.equal(run.head_sha, sha);
  assert.equal(run.conclusion, "success");
  gh("run", "download", id, "--repo", repo, "-n", artifact, "-D", destination);
}

const output = "release-files";
download(process.env.WINDOWS_RUN, "windows-release", "Medstack-Windows", output);
download(process.env.MACOS_RUN, "macos", "Medstack-macOS-x64", "mac-x64");
download(process.env.MACOS_RUN, "macos", "Medstack-macOS-arm64", "mac-arm64");
download(process.env.ANDROID_RUN, "android", "Medstack-Android-unsigned", "android-build");

function find(root, name) {
  const matches = fs.readdirSync(root, { recursive: true }).filter(
    (entry) => path.basename(entry) === name,
  );
  assert.equal(matches.length, 1, `Expected one ${name}`);
  return path.join(root, matches[0]);
}

for (const [arch, platform] of [["x64", "macos_x64"], ["arm64", "macos_arm64"]]) {
  const name = releaseFilename(version, platform);
  fs.copyFileSync(find(`mac-${arch}`, name), path.join(output, name));
}

assert.match(process.env.ANDROID_BLOB, /^[0-9a-f]{40}$/);
const blob = api(`git/blobs/${process.env.ANDROID_BLOB}`);
assert.equal(blob.encoding, "base64");
const apk = path.join(output, releaseFilename(version, "android"));
fs.writeFileSync(apk, Buffer.from(blob.content, "base64"));
const signer = find("android-build", "apksigner.jar");
const signature = execFileSync("java", ["-jar", signer, "verify", "--print-certs", apk], { encoding: "utf8" });
assert.match(signature, /certificate SHA-256 digest: 7eb67fe3f6360bf064840a3bb222df98ab8f00696b0f0c8f7575ac67913059a3/i);
const unsigned = find("android-build", "app-release-unsigned.apk");
const payload = (file) => execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
  .trim().split("\n").filter((entry) =>
    !entry.endsWith("/") && !/^META-INF\/(?:[^/]+\.(?:SF|RSA|DSA|EC)|MANIFEST\.MF)$/i.test(entry),
  ).sort();
const entries = payload(unsigned);
assert.deepEqual(payload(apk), entries);
for (const entry of entries) {
  const extract = (file) => execFileSync("unzip", ["-p", file, entry], { maxBuffer: 32 * 1024 * 1024 });
  assert.deepEqual(extract(apk), extract(unsigned), `APK payload changed: ${entry}`);
}

const tag = `v${version}`;
const assets = RELEASE_PLATFORMS.map((platform) => {
  const name = releaseFilename(version, platform);
  const file = find(output, name);
  const data = fs.readFileSync(file);
  assert(data.length > 100000);
  return { platform, name, file, size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
});
const catalog = validateRelease({
  schema: 1, version, publishedAt: new Date().toISOString(),
  title: notes.title, notes: notes.notes, urgent: notes.urgent,
  downloads: Object.fromEntries(assets.map(({ platform, name, sha256 }) => [
    platform, { url: `https://github.com/${repo}/releases/download/${tag}/${name}`, sha256 },
  ])),
});

assert.equal(api("git/ref/heads/main").object.sha, sha, "Main moved after build");
const release = await publishVerifiedDraft({ api, upload, tag, sha, catalog, assets });
catalog.publishedAt = release.published_at;
fs.writeFileSync("release-announcement.json", JSON.stringify(validateRelease(catalog), null, 2) + "\n");
console.log(release.html_url);
