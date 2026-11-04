import test from "node:test";
import assert from "node:assert/strict";
import { publishVerifiedDraft } from "../scripts/release-draft.mjs";

const tag = "v9.9.9";
const sha = "a".repeat(40);
const catalog = { title: "Synthetic release", notes: ["Synthetic change"] };
const asset = { name: "test.exe", size: 42, sha256: "b".repeat(64) };
const uploaded = { name: asset.name, size: asset.size, digest: `sha256:${asset.sha256}`, state: "uploaded" };
const draft = { id: 21, tag_name: tag, target_commitish: sha, draft: true, assets: [] };

test("刚创建的草稿尚未出现在列表时，使用创建回执中的 ID 继续发布", async () => {
  const actions = [];
  const release = await publishVerifiedDraft({
    tag, sha, catalog, assets: [asset],
    api(route, method = "GET", body) {
      actions.push([method, route]);
      if (route === "releases?per_page=100") return [];
      if (method === "POST") {
        assert.equal(body.target_commitish, sha);
        return draft;
      }
      assert.deepEqual(body, { draft: false, make_latest: "true" });
      return { ...draft, draft: false, assets: [uploaded], published_at: "2026-11-03T00:00:00Z" };
    },
    async upload(release, file) {
      assert.equal(release.id, draft.id);
      assert.equal(file, asset);
      return uploaded;
    },
  });
  assert.equal(release.draft, false);
  assert.deepEqual(actions, [["GET", "releases?per_page=100"], ["POST", "releases"], ["PATCH", "releases/21"]]);
});

test("草稿附件校验失败时保留草稿", async () => {
  await assert.rejects(publishVerifiedDraft({
    tag, sha, catalog, assets: [asset],
    api(route) {
      assert.equal(route, "releases?per_page=100");
      return [draft];
    },
    async upload() { return { ...uploaded, digest: "sha256:invalid" }; },
  }), /sha256/);
});
