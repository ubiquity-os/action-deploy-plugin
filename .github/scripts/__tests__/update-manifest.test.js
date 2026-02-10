const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  buildManifest,
  customReviver,
  validateCommands,
  convertTypeBoxCommandSchema,
  validateListeners,
  extractSupportedEvents,
  orderManifestFields,
  resolvePluginModulePath,
  findSourceSchemaCandidateFiles,
  pickManifestExports,
  parseDenoLoaderOutput,
  ensureNodeDenoShim,
} = require("../update-manifest.js");

const REPO_INFO = { repository: "ubiquity-os/test-plugin", refName: "main" };

describe("buildManifest", () => {
  it("populates all fields when all exports and package.json are present", () => {
    const existingManifest = { homepage_url: "https://example.com" };
    const pluginModule = {
      pluginSettingsSchema: {
        type: "object",
        properties: { greeting: { type: "string", default: "Hello" } },
        required: ["greeting"],
      },
      commandSchema: {
        hello: {
          description: "Say hello",
          "ubiquity:example": "/hello world",
        },
      },
      pluginSkipBotEvents: true,
    };
    const supportedEvents = ["issue_comment.created", "issues.labeled"];
    const packageJson = {
      name: "my-plugin",
      description: "A great plugin",
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
      { supportedEvents },
    );

    assert.equal(manifest.name, "my-plugin");
    assert.equal(manifest.short_name, "ubiquity-os/test-plugin@main");
    assert.equal(manifest.description, "A great plugin");
    assert.deepEqual(manifest.commands, pluginModule.commandSchema);
    assert.deepEqual(manifest["ubiquity:listeners"], supportedEvents);
    assert.equal(manifest.skipBotEvents, true);
    assert.ok(manifest.configuration);
    assert.equal(manifest.homepage_url, "https://example.com");
    // No warnings about missing exports
    const missingWarnings = warnings.filter((w) => w.includes("not found"));
    assert.equal(missingWarnings.length, 0);
  });

  it("is backward-compatible when only pluginSettingsSchema is present", () => {
    const existingManifest = {
      name: "old-name",
      description: "old desc",
      commands: { old: { description: "old", "ubiquity:example": "/old" } },
      "ubiquity:listeners": ["push"],
      skipBotEvents: false,
    };
    const pluginModule = {
      pluginSettingsSchema: { type: "object", properties: {} },
    };
    const packageJson = { name: "new-name", description: "new desc" };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
    );

    // configuration and short_name always set
    assert.ok(manifest.configuration);
    assert.equal(manifest.short_name, "ubiquity-os/test-plugin@main");
    // name and description come from package.json
    assert.equal(manifest.name, "new-name");
    assert.equal(manifest.description, "new desc");
    // commands/listeners remain preserved since no related exports were provided
    assert.deepEqual(manifest.commands, {
      old: { description: "old", "ubiquity:example": "/old" },
    });
    // skipBotEvents defaults to true when pluginSkipBotEvents is not exported
    assert.equal(manifest.skipBotEvents, true);
    // Warnings about missing commandSchema, SupportedEvents, pluginSkipBotEvents
    assert.ok(warnings.some((w) => w.includes("commandSchema")));
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("ubiquity:listeners") &&
          w.includes("not be auto-generated"),
      ),
    );
    assert.ok(warnings.some((w) => w.includes("pluginSkipBotEvents")));
  });

  it("preserves existing manifest name when package.json has no name", () => {
    const existingManifest = { name: "existing-name" };
    const pluginModule = {};
    const packageJson = { version: "1.0.0" };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
    );

    assert.equal(manifest.name, "existing-name");
    assert.ok(
      warnings.some(
        (w) => w.includes("manifest.name") && w.includes("Keeping existing"),
      ),
    );
  });

  it("preserves existing manifest description when package.json has no description", () => {
    const existingManifest = { description: "existing desc" };
    const pluginModule = {};
    const packageJson = { name: "my-plugin" };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
    );

    assert.equal(manifest.description, "existing desc");
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.description") && w.includes("Keeping existing"),
      ),
    );
  });

  it("warns when package.json is null and no existing manifest values", () => {
    const existingManifest = {};
    const pluginModule = {};
    const packageJson = null;

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
    );

    assert.equal(manifest.name, undefined);
    assert.equal(manifest.description, undefined);
    assert.equal(manifest.skipBotEvents, true);
    assert.ok(
      warnings.some(
        (w) => w.includes("manifest.name") && w.includes("will be absent"),
      ),
    );
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.description") && w.includes("will be absent"),
      ),
    );
  });

  it("skips commands with invalid type (string)", () => {
    const existingManifest = {};
    const pluginModule = { commandSchema: "not-an-object" };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.commands, undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes("commandSchema export is invalid") &&
          w.includes("must be a plain object"),
      ),
    );
  });

  it("uses commandSchema when present", () => {
    const existingManifest = {};
    const pluginModule = {
      commandSchema: {
        hello: {
          description: "Say hello",
          "ubiquity:example": "/hello world",
        },
      },
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.deepEqual(manifest.commands, pluginModule.commandSchema);
    assert.ok(
      !warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes("Field will not be auto-generated"),
      ),
    );
  });

  it("always uses commandSchema even when pluginCommands is present", () => {
    const existingManifest = {};
    const pluginModule = {
      pluginCommands: {
        first: {
          description: "Primary command source",
          "ubiquity:example": "/first",
        },
      },
      commandSchema: {
        second: {
          description: "Fallback command source",
          "ubiquity:example": "/second",
        },
      },
    };

    const { manifest } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.deepEqual(manifest.commands, pluginModule.commandSchema);
  });

  it("converts TypeBox commandSchema union to manifest.commands", () => {
    const existingManifest = {};
    const pluginModule = {
      commandSchema: {
        anyOf: [
          {
            type: "object",
            properties: {
              name: {
                const: "start",
                description: "Assign yourself and/or others to the issue/task.",
                examples: ["/start"],
              },
              parameters: {
                type: "object",
                properties: {
                  teammates: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
          {
            type: "object",
            properties: {
              name: {
                const: "stop",
                description: "Unassign yourself from the issue/task.",
                examples: ["/stop"],
              },
            },
          },
        ],
      },
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(
      manifest.commands.start.description,
      "Assign yourself and/or others to the issue/task.",
    );
    assert.equal(manifest.commands.start["ubiquity:example"], "/start");
    assert.equal(
      manifest.commands.stop.description,
      "Unassign yourself from the issue/task.",
    );
    assert.equal(manifest.commands.stop["ubiquity:example"], "/stop");
    assert.ok(
      !warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes("could not be converted"),
      ),
    );
  });

  it("reuses existing manifest command metadata when commandSchema omits it", () => {
    const existingManifest = {
      commands: {
        stop: {
          description: "Unassign yourself from the issue/task.",
          "ubiquity:example": "/stop",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
    };
    const pluginModule = {
      commandSchema: {
        anyOf: [
          {
            type: "object",
            properties: {
              name: {
                const: "stop",
              },
            },
          },
        ],
      },
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(
      manifest.commands.stop.description,
      "Unassign yourself from the issue/task.",
    );
    assert.equal(manifest.commands.stop["ubiquity:example"], "/stop");
    assert.deepEqual(manifest.commands.stop.parameters, {
      type: "object",
      properties: {},
    });
    assert.ok(
      !warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes("could not be converted"),
      ),
    );
  });

  it("warns when commandSchema exists but cannot be converted", () => {
    const existingManifest = {};
    const pluginModule = {
      commandSchema: {
        anyOf: [
          {
            type: "object",
            properties: {
              name: {
                type: "string",
              },
            },
          },
        ],
      },
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.commands, undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes("could not be converted"),
      ),
    );
  });

  it("skips commands when command is missing description", () => {
    const existingManifest = {};
    const pluginModule = {
      commandSchema: {
        bad: { "ubiquity:example": "/bad" },
      },
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.commands, undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes('missing a "description"'),
      ),
    );
  });

  it("skips commands when command is missing ubiquity:example", () => {
    const existingManifest = {};
    const pluginModule = {
      commandSchema: {
        bad: { description: "A command" },
      },
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.commands, undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.commands") &&
          w.includes('missing a "ubiquity:example"'),
      ),
    );
  });

  it("skips listeners with invalid type (object)", () => {
    const existingManifest = {};
    const pluginModule = {};

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
      { supportedEvents: { event: true } },
    );

    assert.equal(manifest["ubiquity:listeners"], undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("ubiquity:listeners") && w.includes("must be an array"),
      ),
    );
  });

  it("skips listeners with invalid entry format (no dot)", () => {
    const existingManifest = {};
    const pluginModule = {};

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
      { supportedEvents: ["push"] },
    );

    assert.equal(manifest["ubiquity:listeners"], undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("ubiquity:listeners") &&
          w.includes("does not look like a valid webhook event"),
      ),
    );
  });

  it("skips skipBotEvents with invalid type (string)", () => {
    const existingManifest = {};
    const pluginModule = { pluginSkipBotEvents: "yes" };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.skipBotEvents, undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.skipBotEvents") &&
          w.includes("expected boolean"),
      ),
    );
  });

  it("applies customReviver only to configuration, not to commands", () => {
    const existingManifest = {};
    const pluginModule = {
      pluginSettingsSchema: {
        type: "object",
        properties: {
          greeting: { type: "string", default: "Hello" },
        },
        required: ["greeting"],
      },
      commandSchema: {
        test: {
          description: "Test command",
          "ubiquity:example": "/test",
          parameters: {
            type: "object",
            properties: {
              arg: { type: "string", default: "val" },
            },
            required: ["arg"],
          },
        },
      },
    };

    const { manifest } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    // Configuration should have required stripped for properties with defaults
    assert.equal(manifest.configuration.required, undefined);

    // Commands parameters should NOT have required stripped
    assert.deepEqual(manifest.commands.test.parameters.required, ["arg"]);
  });

  it("warns when pluginSettingsSchema is missing", () => {
    const existingManifest = {};
    const pluginModule = {};

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.configuration, undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("manifest.configuration") &&
          w.includes("pluginSettingsSchema"),
      ),
    );
  });

  it("sets short_name and default skipBotEvents when manifest is empty and no exports", () => {
    const existingManifest = {};
    const pluginModule = {};

    const { manifest } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.short_name, "ubiquity-os/test-plugin@main");
    assert.equal(manifest.skipBotEvents, true);
    const definedKeys = Object.keys(manifest).filter(
      (k) => manifest[k] !== undefined,
    );
    assert.deepEqual(definedKeys, ["short_name", "skipBotEvents"]);
  });

  it("handles skipBotEvents=false correctly", () => {
    const existingManifest = {};
    const pluginModule = { pluginSkipBotEvents: false };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.skipBotEvents, false);
    // No warning about skipBotEvents being invalid
    assert.ok(
      !warnings.some(
        (w) => w.includes("skipBotEvents") && w.includes("invalid type"),
      ),
    );
  });

  it("handles empty string name in package.json", () => {
    const existingManifest = { name: "existing" };
    const pluginModule = {};
    const packageJson = { name: "", description: "   " };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
    );

    assert.equal(manifest.name, "existing");
    assert.ok(
      warnings.some(
        (w) => w.includes("manifest.name") && w.includes("Keeping existing"),
      ),
    );
  });
});

describe("validateCommands", () => {
  it("returns null for valid commands", () => {
    const result = validateCommands({
      hello: {
        description: "Hello command",
        "ubiquity:example": "/hello world",
      },
    });
    assert.equal(result, null);
  });

  it("rejects array", () => {
    const result = validateCommands([]);
    assert.ok(result.includes("must be a plain object"));
  });

  it("rejects null", () => {
    const result = validateCommands(null);
    assert.ok(result.includes("must be a plain object"));
  });

  it("rejects command with non-object value", () => {
    const result = validateCommands({ hello: "not-an-object" });
    assert.ok(result.includes("must be an object"));
  });

  it("rejects command missing description", () => {
    const result = validateCommands({
      hello: { "ubiquity:example": "/hello" },
    });
    assert.ok(result.includes('missing a "description"'));
  });

  it("rejects command missing ubiquity:example", () => {
    const result = validateCommands({
      hello: { description: "Hello" },
    });
    assert.ok(result.includes('missing a "ubiquity:example"'));
  });
});

describe("convertTypeBoxCommandSchema", () => {
  it("returns a commands map for a valid TypeBox union schema", () => {
    const { commands, error } = convertTypeBoxCommandSchema({
      anyOf: [
        {
          type: "object",
          properties: {
            name: {
              const: "start",
              description: "Start command",
              examples: ["/start"],
            },
          },
        },
      ],
    });

    assert.equal(error, null);
    assert.equal(commands.start.description, "Start command");
    assert.equal(commands.start["ubiquity:example"], "/start");
  });

  it("returns an error when union variants are missing", () => {
    const { commands, error } = convertTypeBoxCommandSchema({});
    assert.equal(commands, null);
    assert.ok(error.includes("anyOf/oneOf"));
  });

  it("falls back to existing command metadata when schema metadata is absent", () => {
    const { commands, error } = convertTypeBoxCommandSchema(
      {
        anyOf: [
          {
            type: "object",
            properties: {
              name: {
                const: "stop",
              },
            },
          },
        ],
      },
      {
        stop: {
          description: "Existing stop command",
          "ubiquity:example": "/stop",
        },
      },
    );

    assert.equal(error, null);
    assert.equal(commands.stop.description, "Existing stop command");
    assert.equal(commands.stop["ubiquity:example"], "/stop");
  });
});

describe("validateListeners", () => {
  it("returns null for valid listeners", () => {
    const result = validateListeners([
      "issue_comment.created",
      "issues.labeled",
    ]);
    assert.equal(result, null);
  });

  it("rejects non-array", () => {
    const result = validateListeners("issue_comment.created");
    assert.ok(result.includes("must be an array"));
  });

  it("rejects entry without dot separator", () => {
    const result = validateListeners(["push"]);
    assert.ok(result.includes("does not look like a valid webhook event"));
  });

  it("rejects non-string entry", () => {
    const result = validateListeners([123]);
    assert.ok(result.includes("does not look like a valid webhook event"));
  });
});

describe("customReviver", () => {
  it("removes required fields that have defaults", () => {
    const schema = {
      type: "object",
      properties: {
        greeting: { type: "string", default: "Hello" },
        name: { type: "string" },
      },
      required: ["greeting", "name"],
    };

    const result = JSON.parse(JSON.stringify(schema), customReviver);
    assert.deepEqual(result.required, ["name"]);
  });

  it("deletes required array when empty after processing", () => {
    const schema = {
      type: "object",
      properties: {
        greeting: { type: "string", default: "Hello" },
      },
      required: ["greeting"],
    };

    const result = JSON.parse(JSON.stringify(schema), customReviver);
    assert.equal(result.required, undefined);
  });

  it("preserves required fields without defaults", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    };

    const result = JSON.parse(JSON.stringify(schema), customReviver);
    assert.deepEqual(result.required, ["name"]);
  });

  it("processes nested objects recursively", () => {
    const schema = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            val: { type: "number", default: 42 },
          },
          required: ["val"],
        },
      },
    };

    const result = JSON.parse(JSON.stringify(schema), customReviver);
    assert.equal(result.properties.nested.required, undefined);
  });
});

describe("orderManifestFields", () => {
  it("orders fields in the expected sequence", () => {
    const manifest = {
      homepage_url: "https://example.com",
      configuration: {},
      skipBotEvents: true,
      name: "test",
      "ubiquity:listeners": [],
      short_name: "test@main",
      description: "A test",
      commands: {},
    };

    const ordered = orderManifestFields(manifest);
    const keys = Object.keys(ordered);

    assert.deepEqual(keys, [
      "name",
      "short_name",
      "description",
      "commands",
      "ubiquity:listeners",
      "skipBotEvents",
      "configuration",
      "homepage_url",
    ]);
  });

  it("appends unknown fields after known ones", () => {
    const manifest = {
      custom_field: "value",
      name: "test",
      short_name: "test@main",
    };

    const ordered = orderManifestFields(manifest);
    const keys = Object.keys(ordered);

    assert.deepEqual(keys, ["name", "short_name", "custom_field"]);
  });

  it("handles manifest with only short_name", () => {
    const manifest = { short_name: "test@main" };

    const ordered = orderManifestFields(manifest);
    const keys = Object.keys(ordered);

    assert.deepEqual(keys, ["short_name"]);
  });
});

describe("buildManifest with supportedEvents fallback", () => {
  it("uses supportedEvents when available", () => {
    const existingManifest = {};
    const pluginModule = {};
    const supportedEvents = ["issue_comment.created", "pull_request.opened"];

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
      { supportedEvents },
    );

    assert.deepEqual(manifest["ubiquity:listeners"], [
      "issue_comment.created",
      "pull_request.opened",
    ]);
    // No warning about missing listeners
    assert.ok(
      !warnings.some(
        (w) =>
          w.includes("ubiquity:listeners") &&
          w.includes("not be auto-generated"),
      ),
    );
  });

  it("uses supportedEvents even when pluginListeners export exists", () => {
    const existingManifest = {};
    const pluginModule = {
      pluginListeners: ["issues.labeled"],
    };
    const supportedEvents = ["issue_comment.created", "pull_request.opened"];

    const { manifest } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
      { supportedEvents },
    );

    assert.deepEqual(manifest["ubiquity:listeners"], [
      "issue_comment.created",
      "pull_request.opened",
    ]);
  });

  it("warns when supportedEvents has invalid entries", () => {
    const existingManifest = {};
    const pluginModule = {};
    const supportedEvents = ["push"]; // invalid: no dot

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
      { supportedEvents },
    );

    assert.equal(manifest["ubiquity:listeners"], undefined);
    assert.ok(
      warnings.some(
        (w) =>
          w.includes("ubiquity:listeners") &&
          w.includes("SupportedEvents type found but invalid"),
      ),
    );
  });

  it("warns when supportedEvents is not available", () => {
    const existingManifest = {};
    const pluginModule = {};

    const { warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
      { supportedEvents: null },
    );

    assert.ok(
      warnings.some(
        (w) =>
          w.includes("ubiquity:listeners") &&
          w.includes("not be auto-generated"),
      ),
    );
  });
});

describe("extractSupportedEvents", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-test-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts events from a SupportedEvents type definition", async () => {
    const srcDir = path.join(tmpDir, "extract-basic", "src", "types");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "context.ts"),
      `import { Context as PluginContext } from "@ubiquity-os/plugin-sdk";
export type SupportedEvents = "issue_comment.created" | "pull_request.opened" | "issues.unassigned";
export type Context = PluginContext<SupportedEvents>;
`,
    );

    const result = await extractSupportedEvents(
      path.join(tmpDir, "extract-basic"),
    );
    assert.deepEqual(result, [
      "issue_comment.created",
      "pull_request.opened",
      "issues.unassigned",
    ]);
  });

  it("extracts events with single quotes", async () => {
    const srcDir = path.join(tmpDir, "extract-single-quotes", "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "context.ts"),
      `export type SupportedEvents = 'issues.opened' | 'issues.closed';
`,
    );

    const result = await extractSupportedEvents(
      path.join(tmpDir, "extract-single-quotes"),
    );
    assert.deepEqual(result, ["issues.opened", "issues.closed"]);
  });

  it("handles non-exported SupportedEvents type", async () => {
    const srcDir = path.join(tmpDir, "extract-non-export", "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "context.ts"),
      `type SupportedEvents = "issue_comment.created" | "issues.labeled";
`,
    );

    const result = await extractSupportedEvents(
      path.join(tmpDir, "extract-non-export"),
    );
    assert.deepEqual(result, ["issue_comment.created", "issues.labeled"]);
  });

  it("returns null when no SupportedEvents type exists", async () => {
    const srcDir = path.join(tmpDir, "extract-none", "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "context.ts"),
      `export type Context = { eventName: string };
`,
    );

    const result = await extractSupportedEvents(
      path.join(tmpDir, "extract-none"),
    );
    assert.equal(result, null);
  });

  it("returns null when src directory does not exist", async () => {
    const projectDir = path.join(tmpDir, "extract-no-src");
    fs.mkdirSync(projectDir, { recursive: true });

    const result = await extractSupportedEvents(projectDir);
    assert.equal(result, null);
  });

  it("handles multiline SupportedEvents type", async () => {
    const srcDir = path.join(tmpDir, "extract-multiline", "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "context.ts"),
      `export type SupportedEvents =
  | "issue_comment.created"
  | "pull_request.opened"
  | "issues.labeled";
`,
    );

    const result = await extractSupportedEvents(
      path.join(tmpDir, "extract-multiline"),
    );
    assert.deepEqual(result, [
      "issue_comment.created",
      "pull_request.opened",
      "issues.labeled",
    ]);
  });
});

describe("resolvePluginModulePath", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-resolve-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns configured path when it exists", async () => {
    const projectDir = path.join(tmpDir, "configured-first");
    const configuredPath = path.join(projectDir, "custom", "module.js");
    fs.mkdirSync(path.dirname(configuredPath), { recursive: true });
    fs.writeFileSync(configuredPath, "export const pluginSettingsSchema = {};");

    const { resolvedPath } = await resolvePluginModulePath(
      configuredPath,
      projectDir,
    );

    assert.equal(resolvedPath, configuredPath);
  });

  it("falls back to dist/plugin/index.js when configured path is missing", async () => {
    const projectDir = path.join(tmpDir, "dist-plugin-fallback");
    const distPluginPath = path.join(projectDir, "dist", "plugin", "index.js");
    fs.mkdirSync(path.dirname(distPluginPath), { recursive: true });
    fs.writeFileSync(distPluginPath, "export const pluginSettingsSchema = {};");

    const { resolvedPath } = await resolvePluginModulePath(
      path.join(projectDir, "missing", "index.js"),
      projectDir,
    );

    assert.equal(resolvedPath, distPluginPath);
  });

  it("scans dist for schema-like exports when conventional paths are absent", async () => {
    const projectDir = path.join(tmpDir, "dist-scan-fallback");
    const scannedBundlePath = path.join(projectDir, "dist", "bundle.min.js");
    fs.mkdirSync(path.dirname(scannedBundlePath), { recursive: true });
    fs.writeFileSync(
      scannedBundlePath,
      "var a={};export{a as pluginSettingsSchema};",
    );

    const { resolvedPath } = await resolvePluginModulePath(
      path.join(projectDir, "missing", "index.js"),
      projectDir,
    );

    assert.equal(resolvedPath, scannedBundlePath);
  });

  it("returns null when no viable module exists", async () => {
    const projectDir = path.join(tmpDir, "none-found");
    fs.mkdirSync(projectDir, { recursive: true });

    const { resolvedPath, checkedPaths } = await resolvePluginModulePath(
      path.join(projectDir, "missing", "index.js"),
      projectDir,
    );

    assert.equal(resolvedPath, null);
    assert.ok(checkedPaths.length > 0);
  });

  it("ignores fallback files that exist but don't look like schema bundles", async () => {
    const projectDir = path.join(tmpDir, "fallback-without-markers");
    const distPluginPath = path.join(projectDir, "dist", "plugin", "index.js");
    fs.mkdirSync(path.dirname(distPluginPath), { recursive: true });
    fs.writeFileSync(distPluginPath, "export const runtimeBundle = true;");

    const { resolvedPath } = await resolvePluginModulePath(
      path.join(projectDir, "missing", "index.js"),
      projectDir,
    );

    assert.equal(resolvedPath, null);
  });
});

describe("findSourceSchemaCandidateFiles", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-source-candidates-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds declaration exports in src/types", async () => {
    const projectDir = path.join(tmpDir, "declarations");
    const typesDir = path.join(projectDir, "src", "types");
    fs.mkdirSync(typesDir, { recursive: true });
    fs.writeFileSync(
      path.join(typesDir, "plugin-input.ts"),
      "export const pluginSettingsSchema = {};",
    );
    fs.writeFileSync(
      path.join(typesDir, "command.ts"),
      "export const commandSchema = {};",
    );

    const candidates = await findSourceSchemaCandidateFiles(projectDir);
    assert.equal(candidates.length, 2);
    assert.ok(candidates[0].endsWith("plugin-input.ts"));
  });

  it("finds re-export patterns in src/types", async () => {
    const projectDir = path.join(tmpDir, "reexports");
    const typesDir = path.join(projectDir, "src", "types");
    fs.mkdirSync(typesDir, { recursive: true });
    fs.writeFileSync(
      path.join(typesDir, "index.ts"),
      'export { commandSchema } from "./command";',
    );
    fs.writeFileSync(path.join(typesDir, "command.ts"), "export const x = 1;");

    const candidates = await findSourceSchemaCandidateFiles(projectDir);
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].endsWith("index.ts"));
  });
});

describe("pickManifestExports", () => {
  it("picks named exports directly", () => {
    const picked = pickManifestExports({
      pluginSettingsSchema: { type: "object" },
      commandSchema: { ping: { description: "Ping", "ubiquity:example": "/ping" } },
      noise: 123,
    });

    assert.deepEqual(Object.keys(picked).sort(), [
      "commandSchema",
      "pluginSettingsSchema",
    ]);
  });

  it("falls back to default object exports", () => {
    const picked = pickManifestExports({
      default: {
        commandSchema: { anyOf: [] },
      },
    });

    assert.deepEqual(Object.keys(picked), ["commandSchema"]);
  });

  it("returns empty object for unsupported inputs", () => {
    assert.deepEqual(pickManifestExports(null), {});
    assert.deepEqual(pickManifestExports("x"), {});
  });
});

describe("parseDenoLoaderOutput", () => {
  it("extracts manifest exports from marked output", () => {
    const parsed = parseDenoLoaderOutput(
      [
        "some log line",
        "__CODEX_MANIFEST_EXPORTS__{\"pluginSettingsSchema\":{\"type\":\"object\"}}",
      ].join("\n"),
    );

    assert.deepEqual(parsed, {
      pluginSettingsSchema: { type: "object" },
    });
  });

  it("throws when marker is missing", () => {
    assert.throws(() => parseDenoLoaderOutput("plain output"));
  });

  it("throws when payload JSON is invalid", () => {
    assert.throws(() =>
      parseDenoLoaderOutput("__CODEX_MANIFEST_EXPORTS__{not-json}"),
    );
  });
});

describe("ensureNodeDenoShim", () => {
  it("injects a minimal shim when Deno is absent", () => {
    const hadDeno = Object.prototype.hasOwnProperty.call(globalThis, "Deno");
    const previous = globalThis.Deno;
    if (hadDeno) {
      delete globalThis.Deno;
    }

    try {
      const injected = ensureNodeDenoShim();
      assert.equal(injected, true);
      assert.equal(typeof globalThis.Deno.env.get, "function");
      assert.equal(typeof globalThis.Deno.cwd, "function");
    } finally {
      delete globalThis.Deno;
      if (hadDeno) {
        globalThis.Deno = previous;
      }
    }
  });

  it("does not overwrite an existing Deno global", () => {
    const hadDeno = Object.prototype.hasOwnProperty.call(globalThis, "Deno");
    const previous = globalThis.Deno;
    globalThis.Deno = { existing: true };

    try {
      const injected = ensureNodeDenoShim();
      assert.equal(injected, false);
      assert.equal(globalThis.Deno.existing, true);
    } finally {
      delete globalThis.Deno;
      if (hadDeno) {
        globalThis.Deno = previous;
      }
    }
  });
});
