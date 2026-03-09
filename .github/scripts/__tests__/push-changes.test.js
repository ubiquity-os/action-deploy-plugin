const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectTreeEntries,
  deriveArtifactRef,
  normalizeArtifactPrefix,
  normalizeBranchName,
} = require("../push-changes.js");

describe("artifact branch helpers", () => {
  it("normalizes source branch names", () => {
    assert.equal(
      normalizeBranchName("refs/heads/feat/example"),
      "feat/example",
    );
    assert.equal(normalizeBranchName("feat/example"), "feat/example");
  });

  it("normalizes artifact prefix", () => {
    assert.equal(normalizeArtifactPrefix("dist"), "dist/");
    assert.equal(normalizeArtifactPrefix("dist/"), "dist/");
    assert.equal(normalizeArtifactPrefix("refs/heads/dist"), "dist/");
  });

  it("maps source branches to dist artifact branches", () => {
    assert.equal(
      deriveArtifactRef("feat/example", "dist/"),
      "dist/feat/example",
    );
    assert.equal(deriveArtifactRef("main", "dist"), "dist/main");
  });

  it("does not double-prefix dist branches", () => {
    assert.equal(
      deriveArtifactRef("dist/feat/example", "dist/"),
      "dist/feat/example",
    );
  });
});

describe("collectTreeEntries", () => {
  function createWorkspace({
    withActionYaml = false,
    withComputeWorkflow = false,
    withPackageJson = false,
    withBunLock = false,
    withBunLockBinary = false,
  } = {}) {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "push-changes-"));
    fs.mkdirSync(path.join(workspace, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "manifest.json"),
      '{"name":"fixture"}\n',
    );
    fs.writeFileSync(
      path.join(workspace, "dist", "index.js"),
      "console.log('artifact');\n",
    );
    if (withActionYaml) {
      fs.writeFileSync(
        path.join(workspace, "action.yml"),
        "name: fixture-action\n",
      );
    }
    if (withComputeWorkflow) {
      fs.mkdirSync(path.join(workspace, ".github", "workflows"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(workspace, ".github", "workflows", "compute.yml"),
        "name: Compute\n",
      );
    }
    if (withPackageJson) {
      fs.writeFileSync(
        path.join(workspace, "package.json"),
        '{"name":"fixture","private":true}\n',
      );
    }
    if (withBunLock) {
      fs.writeFileSync(path.join(workspace, "bun.lock"), "# bun lockfile v1\n");
    }
    if (withBunLockBinary) {
      fs.writeFileSync(
        path.join(workspace, "bun.lockb"),
        Buffer.from([0, 1, 2, 3]),
      );
    }
    return workspace;
  }

  it("includes action.yml when present at repository root", () => {
    const workspace = createWorkspace({ withActionYaml: true });
    try {
      const entries = collectTreeEntries({
        githubWorkspace: workspace,
        manifestPathInput: "manifest.json",
      });
      const entryPaths = entries.map((entry) => entry.path);
      assert.ok(entryPaths.includes("manifest.json"));
      assert.ok(entryPaths.includes("dist/index.js"));
      assert.ok(entryPaths.includes("action.yml"));
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("does not include action.yml when absent", () => {
    const workspace = createWorkspace();
    try {
      const entries = collectTreeEntries({
        githubWorkspace: workspace,
        manifestPathInput: "manifest.json",
      });
      const entryPaths = entries.map((entry) => entry.path);
      assert.ok(entryPaths.includes("manifest.json"));
      assert.ok(entryPaths.includes("dist/index.js"));
      assert.ok(!entryPaths.includes("action.yml"));
      assert.ok(!entryPaths.includes(".github/workflows/compute.yml"));
      assert.ok(!entryPaths.includes("package.json"));
      assert.ok(!entryPaths.includes("bun.lock"));
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("includes .github/workflows/compute.yml when present", () => {
    const workspace = createWorkspace({ withComputeWorkflow: true });
    try {
      const entries = collectTreeEntries({
        githubWorkspace: workspace,
        manifestPathInput: "manifest.json",
      });
      const entryPaths = entries.map((entry) => entry.path);
      assert.ok(entryPaths.includes("manifest.json"));
      assert.ok(entryPaths.includes("dist/index.js"));
      assert.ok(entryPaths.includes(".github/workflows/compute.yml"));
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("includes package.json and bun.lock when present", () => {
    const workspace = createWorkspace({
      withPackageJson: true,
      withBunLock: true,
    });
    try {
      const entries = collectTreeEntries({
        githubWorkspace: workspace,
        manifestPathInput: "manifest.json",
      });
      const entryPaths = entries.map((entry) => entry.path);
      assert.ok(entryPaths.includes("manifest.json"));
      assert.ok(entryPaths.includes("dist/index.js"));
      assert.ok(entryPaths.includes("package.json"));
      assert.ok(entryPaths.includes("bun.lock"));
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("encodes bun.lockb as base64 when present", () => {
    const workspace = createWorkspace({ withBunLockBinary: true });
    try {
      const entries = collectTreeEntries({
        githubWorkspace: workspace,
        manifestPathInput: "manifest.json",
      });
      const lockEntry = entries.find((entry) => entry.path === "bun.lockb");
      assert.ok(lockEntry);
      assert.equal(lockEntry.encoding, "base64");
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
