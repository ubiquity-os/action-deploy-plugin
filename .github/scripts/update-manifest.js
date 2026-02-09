const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { glob } = require("glob");

/**
 * Emits a GitHub Actions warning annotation.
 */
function warning(message) {
  console.log(`::warning::${message}`);
}

/**
 * Recursively removes properties from `required` arrays
 * when those properties have a `default` value defined.
 */
function customReviver(_key, value) {
  if (typeof value === "object" && value !== null) {
    if ("properties" in value && "required" in value) {
      const requiredFields = new Set(value.required);
      for (const [propKey, propValue] of Object.entries(value.properties)) {
        if (typeof propValue === "object" && "default" in propValue) {
          requiredFields.delete(propKey);
        }
      }
      value.required = Array.from(requiredFields);
      if (value.required.length === 0) {
        delete value.required;
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        JSON.parse(JSON.stringify(item), customReviver),
      );
    } else {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          JSON.parse(JSON.stringify(v), customReviver),
        ]),
      );
    }
  }
  return value;
}

/**
 * Validates that pluginCommands is a well-formed commands object.
 * Returns an error string if invalid, or null if valid.
 */
function validateCommands(commands) {
  if (
    typeof commands !== "object" ||
    Array.isArray(commands) ||
    commands === null
  ) {
    return "pluginCommands must be a plain object (Record<string, CommandSchema>)";
  }
  for (const [key, cmd] of Object.entries(commands)) {
    if (typeof cmd !== "object" || cmd === null) {
      return `Command "${key}" must be an object`;
    }
    if (!cmd.description || typeof cmd.description !== "string") {
      return `Command "${key}" is missing a "description" string`;
    }
    if (
      !cmd["ubiquity:example"] ||
      typeof cmd["ubiquity:example"] !== "string"
    ) {
      return `Command "${key}" is missing a "ubiquity:example" string`;
    }
  }
  return null;
}

/**
 * Validates that pluginListeners is a well-formed listeners array.
 * Returns an error string if invalid, or null if valid.
 */
function validateListeners(listeners) {
  if (!Array.isArray(listeners)) {
    return "pluginListeners must be an array of webhook event strings";
  }
  for (const listener of listeners) {
    if (typeof listener !== "string" || !listener.includes(".")) {
      return `Listener "${listener}" does not look like a valid webhook event (expected format: "event.action")`;
    }
  }
  return null;
}

/**
 * Scans TypeScript source files in the project for a `SupportedEvents` type alias
 * and extracts the string literal union members.
 *
 * Looks for patterns like:
 *   export type SupportedEvents = "issue_comment.created" | "pull_request.opened";
 *
 * @param {string} projectRoot - The root directory of the consuming plugin project
 * @returns {Promise<string[]|null>} Array of event strings, or null if not found
 */
async function extractSupportedEvents(projectRoot) {
  const srcDir = path.join(projectRoot, "src");

  try {
    await fs.access(srcDir);
  } catch {
    return null;
  }

  const tsFiles = await glob("**/*.ts", { cwd: srcDir, absolute: true });

  for (const file of tsFiles) {
    const content = await fs.readFile(file, "utf8");

    // Match: (export)? type SupportedEvents = "event.action" | "other.event" ...;
    // The 's' flag makes '.' match newlines for multiline type definitions.
    const match = content.match(
      /(?:export\s+)?type\s+SupportedEvents\s*=\s*(.+?);/s,
    );
    if (!match) continue;

    const unionBody = match[1];
    // Extract all quoted string literals from the union
    const literals = [];
    const literalRegex = /["']([^"']+)["']/g;
    let literalMatch;
    while ((literalMatch = literalRegex.exec(unionBody)) !== null) {
      literals.push(literalMatch[1]);
    }

    if (literals.length > 0) {
      const relativePath = path.relative(projectRoot, file);
      console.log(
        `Found SupportedEvents type in ${relativePath}: ${JSON.stringify(literals)}`,
      );
      return literals;
    }
  }

  return null;
}

/**
 * Orders manifest fields in a deterministic order to avoid noisy diffs.
 */
function orderManifestFields(manifest) {
  const fieldOrder = [
    "name",
    "short_name",
    "description",
    "commands",
    "ubiquity:listeners",
    "skipBotEvents",
    "configuration",
    "homepage_url",
  ];

  const ordered = {};
  for (const key of fieldOrder) {
    if (manifest[key] !== undefined) {
      ordered[key] = manifest[key];
    }
  }
  for (const key of Object.keys(manifest)) {
    if (!(key in ordered)) {
      ordered[key] = manifest[key];
    }
  }
  return ordered;
}

/**
 * Core manifest building logic. Exported for testing.
 *
 * @param {object} existingManifest - The current manifest.json contents
 * @param {object} pluginModule - The loaded plugin schema module exports
 * @param {object|null} packageJson - The consuming plugin's package.json (or null if unreadable)
 * @param {object} repoInfo - { repository: string, refName: string }
 * @param {object} [options] - Additional options
 * @param {string[]|null} [options.supportedEvents] - Events extracted from SupportedEvents type
 * @returns {{ manifest: object, warnings: string[] }}
 */
function buildManifest(
  existingManifest,
  pluginModule,
  packageJson,
  repoInfo,
  options = {},
) {
  const manifest = { ...existingManifest };
  const warnings = [];

  // --- name (from package.json) ---
  if (
    packageJson?.name &&
    typeof packageJson.name === "string" &&
    packageJson.name.trim()
  ) {
    manifest["name"] = packageJson.name;
  } else if (manifest["name"]) {
    warnings.push(
      `manifest.name: no "name" found in package.json. Keeping existing manifest value: ${manifest["name"]}`,
    );
  } else {
    warnings.push(
      'manifest.name: no "name" found in package.json and no existing value in manifest.json. Field will be absent.',
    );
  }

  // --- short_name (unchanged behavior) ---
  manifest["short_name"] = `${repoInfo.repository}@${repoInfo.refName}`;

  // --- description (from package.json) ---
  if (
    packageJson?.description &&
    typeof packageJson.description === "string" &&
    packageJson.description.trim()
  ) {
    manifest["description"] = packageJson.description;
  } else if (manifest["description"]) {
    warnings.push(
      `manifest.description: no "description" found in package.json. Keeping existing manifest value: ${manifest["description"]}`,
    );
  } else {
    warnings.push(
      'manifest.description: no "description" found in package.json and no existing value in manifest.json. Field will be absent.',
    );
  }

  // --- commands (from pluginCommands export) ---
  const pluginCommands = pluginModule.pluginCommands;
  if (pluginCommands !== undefined && pluginCommands !== null) {
    const validationError = validateCommands(pluginCommands);
    if (validationError) {
      warnings.push(`manifest.commands: ${validationError}. Skipping.`);
    } else {
      manifest["commands"] = pluginCommands;
    }
  } else {
    warnings.push(
      'manifest.commands: no "pluginCommands" export found in schema module. Field will not be auto-generated.',
    );
  }

  // --- ubiquity:listeners (from pluginListeners export, fallback to SupportedEvents type) ---
  const pluginListeners = pluginModule.pluginListeners;
  const supportedEvents = options.supportedEvents;
  if (pluginListeners !== undefined && pluginListeners !== null) {
    const validationError = validateListeners(pluginListeners);
    if (validationError) {
      warnings.push(
        `manifest["ubiquity:listeners"]: ${validationError}. Skipping.`,
      );
    } else {
      manifest["ubiquity:listeners"] = pluginListeners;
    }
  } else if (supportedEvents !== undefined && supportedEvents !== null) {
    const validationError = validateListeners(supportedEvents);
    if (validationError) {
      warnings.push(
        `manifest["ubiquity:listeners"]: SupportedEvents type found but invalid: ${validationError}. Skipping.`,
      );
    } else {
      manifest["ubiquity:listeners"] = supportedEvents;
      console.log(
        'manifest["ubiquity:listeners"]: derived from SupportedEvents type.',
      );
    }
  } else {
    warnings.push(
      'manifest["ubiquity:listeners"]: no "pluginListeners" export or SupportedEvents type found. Field will not be auto-generated.',
    );
  }

  // --- skipBotEvents (from pluginSkipBotEvents export) ---
  const pluginSkipBotEvents = pluginModule.pluginSkipBotEvents;
  if (pluginSkipBotEvents !== undefined && pluginSkipBotEvents !== null) {
    if (typeof pluginSkipBotEvents === "boolean") {
      manifest["skipBotEvents"] = pluginSkipBotEvents;
    } else {
      warnings.push(
        `manifest.skipBotEvents: pluginSkipBotEvents export has invalid type "${typeof pluginSkipBotEvents}" (expected boolean). Skipping.`,
      );
    }
  } else {
    warnings.push(
      'manifest.skipBotEvents: no "pluginSkipBotEvents" export found in schema module. Field will not be auto-generated.',
    );
  }

  // --- configuration (from pluginSettingsSchema export, unchanged behavior) ---
  const pluginSettingsSchema = pluginModule.pluginSettingsSchema;
  if (pluginSettingsSchema) {
    // Apply customReviver only to the configuration subtree
    manifest["configuration"] = JSON.parse(
      JSON.stringify(pluginSettingsSchema),
      customReviver,
    );
  } else {
    warnings.push(
      'manifest.configuration: no "pluginSettingsSchema" export found in schema module. Configuration will not be auto-generated.',
    );
  }

  // --- homepage_url: not touched, preserved from existing manifest ---

  return { manifest: orderManifestFields(manifest), warnings };
}

/**
 * Loads the compiled schema module using ESM-first, CJS-fallback.
 */
async function loadPluginModule(modulePath) {
  try {
    const pluginModule = await import(`file://${modulePath}`);
    return pluginModule;
  } catch (esmError) {
    try {
      const pluginModule = require(modulePath);
      return pluginModule;
    } catch (cjsError) {
      console.error("Error loading module as ESM and CJS:", esmError, cjsError);
      process.exit(1);
    }
  }
}

/**
 * Resolves configuration from environment variables (CI mode) or CLI arguments (local mode).
 *
 * Local mode usage:
 *   node update-manifest.js /path/to/plugin-project
 *
 * This will:
 *   - Use the project's manifest.json, package.json, and src/ directory
 *   - Attempt to load the compiled schema from plugin/index.js
 *   - Use "local/project@local" as the short_name
 */
function resolveConfig() {
  const localProjectRoot = process.argv[2];

  if (localProjectRoot) {
    const projectRoot = path.resolve(localProjectRoot);
    return {
      manifestPath: path.join(projectRoot, "manifest.json"),
      pluginModulePath: path.join(projectRoot, "plugin", "index.js"),
      projectRoot,
      repository: `local/${path.basename(projectRoot)}`,
      refName: "local",
    };
  }

  const manifestPath = process.env.MANIFEST_PATH;
  const pluginModulePath = process.env.PLUGIN_MODULE_PATH
    ? path.resolve(process.env.PLUGIN_MODULE_PATH)
    : null;
  const projectRoot = process.env.GITHUB_WORKSPACE;
  const repository = process.env.GITHUB_REPOSITORY;
  const refName = process.env.GITHUB_REF_NAME;

  if (
    !manifestPath ||
    !pluginModulePath ||
    !projectRoot ||
    !repository ||
    !refName
  ) {
    console.error(
      "Missing required environment variables (MANIFEST_PATH, PLUGIN_MODULE_PATH, GITHUB_WORKSPACE, GITHUB_REPOSITORY, GITHUB_REF_NAME)",
    );
    console.error(
      "\nFor local testing, pass the project root as an argument:\n  node update-manifest.js /path/to/plugin-project",
    );
    process.exit(1);
  }

  return { manifestPath, pluginModulePath, projectRoot, repository, refName };
}

/**
 * Main entrypoint — reads files, builds manifest, writes output.
 */
async function main() {
  const config = resolveConfig();

  // Load the compiled schema module
  let pluginModule = {};
  if (fsSync.existsSync(config.pluginModulePath)) {
    console.log(`Loading plugin module from: ${config.pluginModulePath}`);
    pluginModule = await loadPluginModule(config.pluginModulePath);
  } else {
    warning(
      `Plugin module not found at ${config.pluginModulePath}. Run the build step first, or exports will not be available.`,
    );
  }

  // Log discovered exports
  const exportsSummary = {
    pluginSettingsSchema: !!pluginModule.pluginSettingsSchema,
    pluginCommands: pluginModule.pluginCommands !== undefined,
    pluginListeners: pluginModule.pluginListeners !== undefined,
    pluginSkipBotEvents: pluginModule.pluginSkipBotEvents !== undefined,
  };
  console.log("Discovered exports:", JSON.stringify(exportsSummary));

  // Extract SupportedEvents from TypeScript source as fallback for listeners
  let supportedEvents = null;
  if (pluginModule.pluginListeners === undefined) {
    console.log(
      "No pluginListeners export found. Scanning TypeScript source for SupportedEvents type...",
    );
    supportedEvents = await extractSupportedEvents(config.projectRoot);
    if (supportedEvents) {
      console.log(
        `Extracted SupportedEvents: ${JSON.stringify(supportedEvents)}`,
      );
    } else {
      console.log("No SupportedEvents type found in source files.");
    }
  }

  // Read consuming plugin's package.json
  let packageJson = null;
  try {
    const pkgPath = path.resolve(config.projectRoot, "package.json");
    packageJson = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  } catch (error) {
    warning(`Could not read package.json: ${error.message}`);
  }

  // Read existing manifest
  let existingManifest = {};
  try {
    existingManifest = JSON.parse(
      await fs.readFile(config.manifestPath, "utf8"),
    );
  } catch (error) {
    console.log(
      `No existing manifest at ${config.manifestPath}, starting fresh.`,
    );
  }

  // Build the updated manifest
  const { manifest, warnings: buildWarnings } = buildManifest(
    existingManifest,
    pluginModule,
    packageJson,
    { repository: config.repository, refName: config.refName },
    { supportedEvents },
  );

  // Emit warnings
  for (const w of buildWarnings) {
    warning(w);
  }

  // Write manifest
  const updatedManifest = JSON.stringify(manifest, null, 2);
  await fs.writeFile(config.manifestPath, updatedManifest, "utf8");
  console.log(`Manifest written to ${config.manifestPath}`);
}

// Export for testing
module.exports = {
  buildManifest,
  customReviver,
  validateCommands,
  validateListeners,
  extractSupportedEvents,
  orderManifestFields,
};

// Run main when executed directly
if (require.main === module) {
  main();
}
