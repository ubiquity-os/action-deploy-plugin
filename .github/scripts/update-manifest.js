#!/usr/bin/env node
const { spawnSync } = require("child_process");

const MANIFEST_TOOL_PACKAGE = "@ubiquity-os/plugin-manifest-tool@latest";

/**
 * Builds the argument list for the manifest tool.
 *
 * @param {string[]} [argv]
 * @returns {string[]}
 */
function getManifestToolArgs(argv = process.argv) {
  const projectRoot = argv[2];
  return projectRoot
    ? [MANIFEST_TOOL_PACKAGE, projectRoot]
    : [MANIFEST_TOOL_PACKAGE];
}

/**
 * Runs the manifest generation tool and returns its exit code.
 *
 * @param {{
 *   argv?: string[],
 *   env?: NodeJS.ProcessEnv,
 *   stdio?: "inherit" | "pipe",
 *   command?: string,
 *   spawnSync?: typeof spawnSync,
 * }} [options]
 * @returns {number}
 */
function runManifestTool(options = {}) {
  const spawn = options.spawnSync ?? spawnSync;
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const stdio = options.stdio ?? "inherit";
  const command = options.command ?? "bunx";

  const args = getManifestToolArgs(argv);
  const result = spawn(command, args, { stdio, env });

  if (result.error) {
    console.error(
      `Failed to execute ${command}: ${result.error.message || String(result.error)}`,
    );
    return 1;
  }

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.signal) {
    console.error(`Manifest generation terminated by signal: ${result.signal}`);
    return 1;
  }

  return 0;
}

if (require.main === module) {
  process.exit(runManifestTool());
}

module.exports = {
  MANIFEST_TOOL_PACKAGE,
  getManifestToolArgs,
  runManifestTool,
};
