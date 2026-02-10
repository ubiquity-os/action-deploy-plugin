const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { glob } = require("glob");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { pathToFileURL } = require("url");

const execFileAsync = promisify(execFile);

const MANIFEST_EXPORT_KEYS = [
  "pluginSettingsSchema",
  "commandSchema",
  "pluginSkipBotEvents",
];

const DENO_OUTPUT_PREFIX = "__CODEX_MANIFEST_EXPORTS__";

/**
 * Emits a GitHub Actions warning annotation.
 */
function warning(message) {
  console.log(`::warning::${message}`);
}

/**
 * Picks only manifest-relevant exports from a loaded module.
 * Supports both named exports and default-exported objects.
 */
function pickManifestExports(moduleValue) {
  if (!moduleValue || typeof moduleValue !== "object") {
    return {};
  }

  const hasNamedExports = MANIFEST_EXPORT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(moduleValue, key),
  );

  const candidate =
    hasNamedExports ||
    !moduleValue.default ||
    typeof moduleValue.default !== "object"
      ? moduleValue
      : moduleValue.default;

  const picked = {};
  for (const key of MANIFEST_EXPORT_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(candidate, key) &&
      candidate[key] !== undefined
    ) {
      picked[key] = candidate[key];
    }
  }
  return picked;
}

/**
 * Parses Deno loader stdout and extracts the exported module payload.
 */
function parseDenoLoaderOutput(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const markerIndex = line.indexOf(DENO_OUTPUT_PREFIX);
    if (markerIndex === -1) continue;

    const payload = line.slice(markerIndex + DENO_OUTPUT_PREFIX.length);
    try {
      const parsed = JSON.parse(payload);
      return pickManifestExports(parsed);
    } catch (error) {
      throw new Error(
        `Invalid JSON payload from Deno loader: ${error.message}`,
      );
    }
  }

  throw new Error("No manifest export payload found in Deno loader output");
}

/**
 * Injects a minimal Deno shim for Node runtime module loading.
 * Returns true when the shim was injected by this function.
 */
function ensureNodeDenoShim() {
  if (typeof globalThis.Deno !== "undefined") {
    return false;
  }

  class NotFound extends Error {}

  globalThis.Deno = {
    env: {
      get: (name) => process.env[name],
      toObject: () => ({ ...process.env }),
    },
    cwd: () => process.cwd(),
    build: {
      os: process.platform,
      arch: process.arch,
    },
    errors: {
      NotFound,
    },
  };

  return true;
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
 * Validates that `commands` is a well-formed command map object.
 * Returns an error string if invalid, or null if valid.
 */
function validateCommands(commands) {
  if (
    typeof commands !== "object" ||
    Array.isArray(commands) ||
    commands === null
  ) {
    return "commands must be a plain object (Record<string, CommandSchema>)";
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
 * Attempts to convert a TypeBox-style command schema union into
 * the manifest commands map format.
 *
 * Expected commandSchema shape (simplified):
 * {
 *   anyOf: [
 *     { properties: { name: { const: "start", description, examples }, parameters: {...} } },
 *     { properties: { name: { const: "stop", description, examples } } }
 *   ]
 * }
 */
function convertTypeBoxCommandSchema(commandSchema, existingCommands = {}) {
  if (
    typeof commandSchema !== "object" ||
    commandSchema === null ||
    Array.isArray(commandSchema)
  ) {
    return { commands: null, error: "commandSchema must be an object" };
  }

  const variants = Array.isArray(commandSchema.anyOf)
    ? commandSchema.anyOf
    : Array.isArray(commandSchema.oneOf)
      ? commandSchema.oneOf
      : null;

  if (!variants || variants.length === 0) {
    return {
      commands: null,
      error: "commandSchema is missing anyOf/oneOf command variants",
    };
  }

  const commands = {};

  for (const variant of variants) {
    if (typeof variant !== "object" || variant === null) {
      return {
        commands: null,
        error: "commandSchema variants must be objects",
      };
    }

    const nameSchema = variant?.properties?.name;
    let commandName = null;

    if (typeof nameSchema?.const === "string" && nameSchema.const.trim()) {
      commandName = nameSchema.const;
    } else if (
      Array.isArray(nameSchema?.enum) &&
      nameSchema.enum.length === 1 &&
      typeof nameSchema.enum[0] === "string" &&
      nameSchema.enum[0].trim()
    ) {
      commandName = nameSchema.enum[0];
    }

    if (!commandName) {
      return {
        commands: null,
        error:
          'Each command variant must define a literal "name" (name.const or single-value name.enum)',
      };
    }

    const existingCommand = existingCommands?.[commandName];
    const description =
      (typeof nameSchema?.description === "string" &&
        nameSchema.description.trim()) ||
      (typeof variant.description === "string" && variant.description.trim()) ||
      (typeof existingCommand?.description === "string" &&
        existingCommand.description.trim()) ||
      commandName;

    let example = null;
    if (
      typeof nameSchema?.["ubiquity:example"] === "string" &&
      nameSchema["ubiquity:example"].trim()
    ) {
      example = nameSchema["ubiquity:example"];
    } else if (
      Array.isArray(nameSchema?.examples) &&
      typeof nameSchema.examples[0] === "string" &&
      nameSchema.examples[0].trim()
    ) {
      example = nameSchema.examples[0];
    } else if (
      typeof existingCommand?.["ubiquity:example"] === "string" &&
      existingCommand["ubiquity:example"].trim()
    ) {
      example = existingCommand["ubiquity:example"];
    } else {
      example = `/${commandName}`;
    }

    const command = {
      description,
      "ubiquity:example": example,
    };

    const parameters = variant?.properties?.parameters;
    if (
      typeof parameters === "object" &&
      parameters !== null &&
      !Array.isArray(parameters)
    ) {
      command.parameters = parameters;
    } else if (
      typeof existingCommand?.parameters === "object" &&
      existingCommand.parameters !== null &&
      !Array.isArray(existingCommand.parameters)
    ) {
      command.parameters = existingCommand.parameters;
    }

    commands[commandName] = command;
  }

  const validationError = validateCommands(commands);
  if (validationError) {
    return {
      commands: null,
      error: `derived commands are invalid: ${validationError}`,
    };
  }

  return { commands, error: null };
}

/**
 * Validates that listeners is a well-formed listeners array.
 * Returns an error string if invalid, or null if valid.
 */
function validateListeners(listeners) {
  if (!Array.isArray(listeners)) {
    return "listeners must be an array of webhook event strings";
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

  // --- commands (from commandSchema export only) ---
  const commandSchema = pluginModule.commandSchema;
  if (commandSchema !== undefined && commandSchema !== null) {
    const validationError = validateCommands(commandSchema);
    if (!validationError) {
      manifest["commands"] = commandSchema;
    } else {
      const looksLikeTypeBoxUnion =
        typeof commandSchema === "object" &&
        commandSchema !== null &&
        (Array.isArray(commandSchema.anyOf) || Array.isArray(commandSchema.oneOf));

      if (!looksLikeTypeBoxUnion) {
        warnings.push(
          `manifest.commands: commandSchema export is invalid (${validationError}). Skipping.`,
        );
      } else {
        const { commands: convertedCommands, error: conversionError } =
          convertTypeBoxCommandSchema(commandSchema, manifest["commands"]);
        if (convertedCommands) {
          manifest["commands"] = convertedCommands;
        } else {
          warnings.push(
            `manifest.commands: commandSchema export found but could not be converted (${conversionError}). Skipping.`,
          );
        }
      }
    }
  } else {
    warnings.push(
      'manifest.commands: no "commandSchema" export found in source schema modules. Field will not be auto-generated.',
    );
  }

  // --- ubiquity:listeners (from SupportedEvents type only) ---
  const supportedEvents = options.supportedEvents;
  if (supportedEvents !== undefined && supportedEvents !== null) {
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
      'manifest["ubiquity:listeners"]: no SupportedEvents type found in source TypeScript modules. Field will not be auto-generated.',
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
      'manifest.skipBotEvents: no "pluginSkipBotEvents" export found in schema module. Defaulting to true.',
    );
    manifest["skipBotEvents"] = true;
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
 * Loads a schema module using Deno-first, then Node ESM/CJS fallbacks.
 */
async function loadPluginModule(modulePath) {
  const loadErrors = [];

  // Deno-first: handles modules that reference Deno globals at module scope.
  try {
    const moduleUrl = pathToFileURL(modulePath).href;
    const script = `
const moduleUrl = ${JSON.stringify(moduleUrl)};
const keys = ${JSON.stringify(MANIFEST_EXPORT_KEYS)};
const loaded = await import(moduleUrl);
const hasNamed = keys.some((key) =>
  Object.prototype.hasOwnProperty.call(loaded, key)
);
const source =
  hasNamed || !loaded.default || typeof loaded.default !== "object"
    ? loaded
    : loaded.default;

const out = {};
for (const key of keys) {
  if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
    out[key] = source[key];
  }
}
console.log(${JSON.stringify(DENO_OUTPUT_PREFIX)} + JSON.stringify(out));
`;

    const { stdout } = await execFileAsync(
      "deno",
      ["eval", "--quiet", script],
      {
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    return parseDenoLoaderOutput(stdout);
  } catch (denoError) {
    loadErrors.push({ runtime: "deno", error: denoError });
  }

  let injectedDenoShim = false;
  try {
    injectedDenoShim = ensureNodeDenoShim();
    const pluginModule = await import(pathToFileURL(modulePath).href);
    return pickManifestExports(pluginModule);
  } catch (esmError) {
    loadErrors.push({
      runtime: injectedDenoShim ? "node-esm+deno-shim" : "node-esm",
      error: esmError,
    });
    try {
      const pluginModule = require(modulePath);
      return pickManifestExports(pluginModule);
    } catch (cjsError) {
      loadErrors.push({ runtime: "node-cjs", error: cjsError });
      const details = loadErrors
        .map(({ runtime, error }) => {
          const message = error && error.message ? error.message : String(error);
          return `[${runtime}] ${message}`;
        })
        .join("\n");
      throw new Error(`Error loading module from ${modulePath}:\n${details}`);
    }
  } finally {
    if (injectedDenoShim) {
      delete globalThis.Deno;
    }
  }
}

/**
 * Resolves the compiled schema module path.
 *
 * Priority:
 * 1) Configured path (PLUGIN_MODULE_PATH)
 * 2) Conventional fallbacks
 * 3) Dist scan for files that appear to export manifest schema symbols
 *
 * @param {string|null} configuredPath
 * @param {string} projectRoot
 * @returns {Promise<{resolvedPath: string|null, checkedPaths: string[], candidatePaths: string[]}>}
 */
async function resolvePluginModulePath(configuredPath, projectRoot) {
  const candidates = [
    configuredPath,
    path.join(projectRoot, "plugin", "index.js"),
    path.join(projectRoot, "dist", "plugin", "index.js"),
    path.join(projectRoot, "dist", "index.js"),
  ]
    .filter(Boolean)
    .map((p) => path.resolve(p));

  const checkedPaths = [...new Set(candidates)];
  const configuredCandidate = checkedPaths[0];
  const candidatePaths = [];

  // If an explicit path was configured, trust it.
  if (configuredCandidate && fsSync.existsSync(configuredCandidate)) {
    candidatePaths.push(configuredCandidate);
  }

  // Fallback candidates should look like schema bundles (contain known export names).
  for (const candidate of checkedPaths.slice(1)) {
    if (!fsSync.existsSync(candidate)) continue;
    let content = "";
    try {
      content = await fs.readFile(candidate, "utf8");
    } catch {
      continue;
    }
    if (
      content.includes("pluginSettingsSchema") ||
      content.includes("commandSchema")
    ) {
      candidatePaths.push(candidate);
    }
  }

  // Last-resort scan for compiled JS in dist that appears to export schema symbols.
  const distDir = path.join(projectRoot, "dist");
  if (fsSync.existsSync(distDir)) {
    const distJsFiles = await glob("**/*.js", {
      cwd: distDir,
      absolute: true,
    });

    for (const file of distJsFiles) {
      let content = "";
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }

      if (
        content.includes("pluginSettingsSchema") ||
        content.includes("commandSchema")
      ) {
        candidatePaths.push(file);
      }
    }
  }

  const uniqueCandidates = [...new Set(candidatePaths)];
  const checkedWithCandidates = [...new Set([...checkedPaths, ...uniqueCandidates])];
  return {
    resolvedPath: uniqueCandidates[0] || null,
    checkedPaths: checkedWithCandidates,
    candidatePaths: uniqueCandidates,
  };
}

/**
 * Finds TypeScript files under src/types that likely export manifest schema symbols.
 *
 * @param {string} projectRoot
 * @returns {Promise<string[]>}
 */
async function findSourceSchemaCandidateFiles(projectRoot) {
  const typesDir = path.join(projectRoot, "src", "types");
  if (!fsSync.existsSync(typesDir)) {
    return [];
  }

  const tsFiles = await glob("**/*.ts", { cwd: typesDir, absolute: true });
  const declarationRegex =
    /\bexport\s+(?:const|let|var)\s+(pluginSettingsSchema|commandSchema|pluginSkipBotEvents)\b/;
  const reexportRegex =
    /\bexport\s*{[^}]*\b(pluginSettingsSchema|commandSchema|pluginSkipBotEvents)\b[^}]*}/;

  const candidates = [];
  for (const file of tsFiles) {
    let content = "";
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }

    if (declarationRegex.test(content) || reexportRegex.test(content)) {
      candidates.push(file);
    }
  }

  // Prefer plugin-input entrypoints first.
  const priority = (filePath) => {
    const base = path.basename(filePath);
    if (base === "plugin-input.ts") return 0;
    if (base === "schema.ts") return 1;
    if (base === "index.ts") return 2;
    return 3;
  };

  return candidates.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

/**
 * Loads manifest exports from TypeScript source schema modules.
 *
 * @param {string} projectRoot
 * @returns {Promise<{exports: object, candidateFiles: string[], loadedFiles: string[], errors: string[]}>}
 */
async function loadSourceSchemaExports(projectRoot) {
  const candidateFiles = await findSourceSchemaCandidateFiles(projectRoot);
  const mergedExports = {};
  const loadedFiles = [];
  const errors = [];

  for (const file of candidateFiles) {
    try {
      const loaded = await loadPluginModule(file);
      let added = false;
      for (const key of MANIFEST_EXPORT_KEYS) {
        if (mergedExports[key] === undefined && loaded[key] !== undefined) {
          mergedExports[key] = loaded[key];
          added = true;
        }
      }
      if (added) {
        loadedFiles.push(file);
      }
    } catch (error) {
      errors.push(`${file}: ${error.message || String(error)}`);
    }
  }

  return { exports: mergedExports, candidateFiles, loadedFiles, errors };
}

/**
 * Formats manifest.json with Prettier.
 * Best-effort only: emits a warning if Prettier is unavailable.
 */
async function formatManifestWithPrettier(manifestPath, cwd) {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  try {
    await execFileAsync(
      npxCommand,
      ["--yes", "prettier", "--write", manifestPath],
      { cwd, maxBuffer: 20 * 1024 * 1024 },
    );
    return true;
  } catch (error) {
    warning(
      `Could not format manifest with Prettier: ${error.message || String(error)}`,
    );
    return false;
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
 *   - Load schema exports directly from source TypeScript modules under src/types/
 *   - Use "local/project@local" as the short_name
 */
function resolveConfig() {
  const localProjectRoot = process.argv[2];

  if (localProjectRoot) {
    const projectRoot = path.resolve(localProjectRoot);
    return {
      manifestPath: path.join(projectRoot, "manifest.json"),
      projectRoot,
      repository: `local/${path.basename(projectRoot)}`,
      refName: "local",
    };
  }

  const manifestPath = process.env.MANIFEST_PATH;
  const projectRoot = process.env.GITHUB_WORKSPACE;
  const repository = process.env.GITHUB_REPOSITORY;
  const refName = process.env.GITHUB_REF_NAME;

  if (!manifestPath || !projectRoot || !repository || !refName) {
    console.error(
      "Missing required environment variables (MANIFEST_PATH, GITHUB_WORKSPACE, GITHUB_REPOSITORY, GITHUB_REF_NAME)",
    );
    console.error(
      "\nFor local testing, pass the project root as an argument:\n  node update-manifest.js /path/to/plugin-project",
    );
    process.exit(1);
  }

  return { manifestPath, projectRoot, repository, refName };
}

/**
 * Main entrypoint — reads files, builds manifest, writes output.
 */
async function main() {
  const config = resolveConfig();

  // Load schema exports directly from source TypeScript modules.
  const sourceSchemas = await loadSourceSchemaExports(config.projectRoot);
  let pluginModule = sourceSchemas.exports;
  if (sourceSchemas.candidateFiles.length === 0) {
    warning(
      'No source schema files found under "src/types". Manifest schema exports will not be auto-generated unless these files exist.',
    );
  } else if (!Object.keys(pluginModule).length) {
    warning(
      "Source schema files were found, but no manifest-related exports were detected.",
    );
  }
  if (sourceSchemas.errors.length > 0) {
    console.log(
      "Source schema load errors:\n" +
        sourceSchemas.errors.join("\n"),
    );
  }

  // Log discovered exports
  const exportsSummary = {
    pluginSettingsSchema: !!pluginModule.pluginSettingsSchema,
    commandSchema: pluginModule.commandSchema !== undefined,
    pluginSkipBotEvents: pluginModule.pluginSkipBotEvents !== undefined,
  };
  console.log("Discovered exports:", JSON.stringify(exportsSummary));

  // Extract listeners from SupportedEvents in source TypeScript modules.
  console.log("Scanning TypeScript source for SupportedEvents type...");
  const supportedEvents = await extractSupportedEvents(config.projectRoot);
  if (supportedEvents) {
    console.log(`Extracted SupportedEvents: ${JSON.stringify(supportedEvents)}`);
  } else {
    console.log("No SupportedEvents type found in source files.");
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
  await formatManifestWithPrettier(config.manifestPath, config.projectRoot);
  console.log(`Manifest written to ${config.manifestPath}`);
}

// Export for testing
module.exports = {
  buildManifest,
  customReviver,
  validateCommands,
  convertTypeBoxCommandSchema,
  validateListeners,
  extractSupportedEvents,
  orderManifestFields,
  resolvePluginModulePath,
  findSourceSchemaCandidateFiles,
  loadSourceSchemaExports,
  formatManifestWithPrettier,
  pickManifestExports,
  parseDenoLoaderOutput,
  ensureNodeDenoShim,
};

// Run main when executed directly
if (require.main === module) {
  main();
}
