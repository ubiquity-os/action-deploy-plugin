const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  MANIFEST_TOOL_PACKAGE,
  getManifestToolArgs,
  runManifestTool,
} = require("../update-manifest.js");

describe("update-manifest wrapper", () => {
  it("builds arguments without a project path", () => {
    const args = getManifestToolArgs(["node", "update-manifest.js"]);
    assert.deepEqual(args, [MANIFEST_TOOL_PACKAGE]);
  });

  it("builds arguments with a project path", () => {
    const args = getManifestToolArgs(["node", "update-manifest.js", "."]);
    assert.deepEqual(args, [MANIFEST_TOOL_PACKAGE, "."]);
  });

  it("invokes bunx with inherited stdio and forwarded env", () => {
    const expectedEnv = { CUSTOM_ENV: "1" };
    let invocation = null;

    const exitCode = runManifestTool({
      argv: ["node", "update-manifest.js"],
      env: expectedEnv,
      spawnSync: (command, args, options) => {
        invocation = { command, args, options };
        return { status: 0 };
      },
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(invocation, {
      command: "bunx",
      args: [MANIFEST_TOOL_PACKAGE],
      options: {
        stdio: "inherit",
        env: expectedEnv,
      },
    });
  });

  it("propagates non-zero exit codes", () => {
    const exitCode = runManifestTool({
      argv: ["node", "update-manifest.js"],
      spawnSync: () => ({ status: 3 }),
    });

    assert.equal(exitCode, 3);
  });

  it("returns 1 when process spawn fails", () => {
    const exitCode = runManifestTool({
      argv: ["node", "update-manifest.js"],
      spawnSync: () => ({ error: new Error("spawn failed") }),
    });

    assert.equal(exitCode, 1);
  });

  it("returns 1 when process exits by signal", () => {
    const exitCode = runManifestTool({
      argv: ["node", "update-manifest.js"],
      spawnSync: () => ({ status: null, signal: "SIGTERM" }),
    });

    assert.equal(exitCode, 1);
  });
});
