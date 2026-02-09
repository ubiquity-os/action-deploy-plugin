const fs = require("fs").promises;
const path = require("path");

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
 * @returns {{ manifest: object, warnings: string[] }}
 */
function buildManifest(existingManifest, pluginModule, packageJson, repoInfo) {
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

  // --- ubiquity:listeners (from pluginListeners export) ---
  const pluginListeners = pluginModule.pluginListeners;
  if (pluginListeners !== undefined && pluginListeners !== null) {
    const validationError = validateListeners(pluginListeners);
    if (validationError) {
      warnings.push(
        `manifest["ubiquity:listeners"]: ${validationError}. Skipping.`,
      );
    } else {
      manifest["ubiquity:listeners"] = pluginListeners;
    }
  } else {
    warnings.push(
      'manifest["ubiquity:listeners"]: no "pluginListeners" export found in schema module. Field will not be auto-generated.',
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
 * Main entrypoint — reads files, builds manifest, writes output.
 */
async function main() {
  const manifestPath = process.env.MANIFEST_PATH;
  const pluginModulePath = path.resolve(process.env.PLUGIN_MODULE_PATH);
  const githubWorkspace = process.env.GITHUB_WORKSPACE;
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const githubRefName = process.env.GITHUB_REF_NAME;

  if (
    !manifestPath ||
    !pluginModulePath ||
    !githubWorkspace ||
    !githubRepository ||
    !githubRefName
  ) {
    console.error(
      "Missing required environment variables (MANIFEST_PATH, PLUGIN_MODULE_PATH, GITHUB_WORKSPACE, GITHUB_REPOSITORY, GITHUB_REF_NAME)",
    );
    process.exit(1);
  }

  // Load the compiled schema module
  console.log(`Loading plugin module from: ${pluginModulePath}`);
  const pluginModule = await loadPluginModule(pluginModulePath);

  // Log discovered exports
  const exportsSummary = {
    pluginSettingsSchema: !!pluginModule.pluginSettingsSchema,
    pluginCommands: pluginModule.pluginCommands !== undefined,
    pluginListeners: pluginModule.pluginListeners !== undefined,
    pluginSkipBotEvents: pluginModule.pluginSkipBotEvents !== undefined,
  };
  console.log("Discovered exports:", JSON.stringify(exportsSummary));

  // Read consuming plugin's package.json
  let packageJson = null;
  try {
    const pkgPath = path.resolve(githubWorkspace, "package.json");
    packageJson = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  } catch (error) {
    warning(`Could not read package.json: ${error.message}`);
  }

  // Read existing manifest
  const existingManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  // Build the updated manifest
  const { manifest, warnings: buildWarnings } = buildManifest(
    existingManifest,
    pluginModule,
    packageJson,
    { repository: githubRepository, refName: githubRefName },
  );

  // Emit warnings
  for (const w of buildWarnings) {
    warning(w);
  }

  // Write manifest
  const updatedManifest = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, updatedManifest, "utf8");
  console.log("Manifest updated successfully.");
}

// Export for testing
module.exports = {
  buildManifest,
  customReviver,
  validateCommands,
  validateListeners,
  orderManifestFields,
};

// Run main when executed directly
if (require.main === module) {
  main();
}
