const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildManifest,
  customReviver,
  validateCommands,
  validateListeners,
  orderManifestFields,
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
      pluginCommands: {
        hello: {
          description: "Say hello",
          "ubiquity:example": "/hello world",
        },
      },
      pluginListeners: ["issue_comment.created", "issues.labeled"],
      pluginSkipBotEvents: true,
    };
    const packageJson = {
      name: "my-plugin",
      description: "A great plugin",
    };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      packageJson,
      REPO_INFO,
    );

    assert.equal(manifest.name, "my-plugin");
    assert.equal(manifest.short_name, "ubiquity-os/test-plugin@main");
    assert.equal(manifest.description, "A great plugin");
    assert.deepEqual(manifest.commands, pluginModule.pluginCommands);
    assert.deepEqual(manifest["ubiquity:listeners"], [
      "issue_comment.created",
      "issues.labeled",
    ]);
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
    // commands, listeners, skipBotEvents not overwritten (existing values kept since no exports)
    // Actually, existing values in manifest are preserved since we spread existingManifest
    // and only set new values when exports are present
    assert.deepEqual(manifest.commands, {
      old: { description: "old", "ubiquity:example": "/old" },
    });
    // Warnings about missing pluginCommands, pluginListeners, pluginSkipBotEvents
    assert.ok(warnings.some((w) => w.includes("pluginCommands")));
    assert.ok(warnings.some((w) => w.includes("pluginListeners")));
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
    const pluginModule = { pluginCommands: "not-an-object" };

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
          w.includes("must be a plain object"),
      ),
    );
  });

  it("skips commands when command is missing description", () => {
    const existingManifest = {};
    const pluginModule = {
      pluginCommands: {
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
      pluginCommands: {
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
    const pluginModule = { pluginListeners: { event: true } };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
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
    const pluginModule = { pluginListeners: ["push"] };

    const { manifest, warnings } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
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
      pluginCommands: {
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

  it("only sets short_name when manifest is empty and no exports", () => {
    const existingManifest = {};
    const pluginModule = {};

    const { manifest } = buildManifest(
      existingManifest,
      pluginModule,
      null,
      REPO_INFO,
    );

    assert.equal(manifest.short_name, "ubiquity-os/test-plugin@main");
    // Only short_name should be defined
    const definedKeys = Object.keys(manifest).filter(
      (k) => manifest[k] !== undefined,
    );
    assert.deepEqual(definedKeys, ["short_name"]);
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
