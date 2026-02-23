const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveArtifactRef,
  normalizeArtifactPrefix,
  normalizeBranchName,
} = require("../push-changes.js");

describe("artifact branch helpers", () => {
  it("normalizes source branch names", () => {
    assert.equal(normalizeBranchName("refs/heads/feat/example"), "feat/example");
    assert.equal(normalizeBranchName("feat/example"), "feat/example");
  });

  it("normalizes artifact prefix", () => {
    assert.equal(normalizeArtifactPrefix("dist"), "dist/");
    assert.equal(normalizeArtifactPrefix("dist/"), "dist/");
    assert.equal(normalizeArtifactPrefix("refs/heads/dist"), "dist/");
  });

  it("maps source branches to dist artifact branches", () => {
    assert.equal(deriveArtifactRef("feat/example", "dist/"), "dist/feat/example");
    assert.equal(deriveArtifactRef("main", "dist"), "dist/main");
  });

  it("does not double-prefix dist branches", () => {
    assert.equal(deriveArtifactRef("dist/feat/example", "dist/"), "dist/feat/example");
  });
});
