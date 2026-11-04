import assert from "node:assert/strict";

export async function publishVerifiedDraft({ api, upload, tag, sha, catalog, assets }) {
  let release = api("releases?per_page=100").find((item) => item.tag_name === tag);
  if (!release) {
    release = api("releases", "POST", {
      tag_name: tag,
      target_commitish: sha,
      name: catalog.title,
      body: catalog.notes.map((line) => "- " + line).join("\n"),
      draft: true,
    });
  }
  assert(Number.isSafeInteger(release.id), "GitHub did not return a release ID");
  assert.equal(release.tag_name, tag);
  assert.equal(release.target_commitish, sha);
  const verify = (expected, actual) => {
    assert.equal(actual?.state, "uploaded", expected.name);
    assert.equal(actual.size, expected.size, expected.name);
    assert.equal(actual.digest, `sha256:${expected.sha256}`, expected.name);
  };
  for (const asset of assets) {
    const existing = release.assets.find((item) => item.name === asset.name);
    if (existing) verify(asset, existing);
    else {
      assert.equal(release.draft, true, "Published release assets are immutable");
      verify(asset, await upload(release, asset));
    }
  }
  if (release.draft) {
    release = api(`releases/${release.id}`, "PATCH", {
      draft: false,
      make_latest: "true",
    });
  }
  assert.equal(release.draft, false);
  assert.equal(release.tag_name, tag);
  assert(Number.isFinite(Date.parse(release.published_at)));
  for (const asset of assets) verify(asset, release.assets.find((item) => item.name === asset.name));
  return release;
}
