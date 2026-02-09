# @ubiquity-os/action-deploy-plugin

Update Manifest, build and commit the changes signing the commit payload.

## Description

This GitHub Action automates the process of checking out a repository, setting up Node.js, installing dependencies, updating the `manifest.json` file, formatting it, and committing/pushing the changes with a signed commit.

## Inputs

- **`manifestPath`**:
    - **Description**: The path to the `manifest.json` file.
    - **Required**: No
    - **Default**: `${{ github.workspace }}/manifest.json`

- **`schemaPath`**:
    - **Description**: The path to the plugin settings schema.
    - **Required**: No
    - **Default**: `${{ github.workspace }}/src/types/plugin-input.ts`

- **`pluginEntry`**:
    - **Description**: The path to the plugin entry file.
    - **Required**: No
    - **Default**: `${{ github.workspace }}/src/index.ts`

- **`commitMessage`**:
    - **Description**: The commit message.
    - **Required**: No
    - **Default**: `chore: updated manifest.json and dist build`

- **`nodeVersion`**:
    - **Description**: The version of Node.js to use.
    - **Default**: `20.10.0`

- **`treatAsEsm`**:
    - **Description**: If the package is set to be treated as ESM, it will replace __dirname occurrences.
    - **Default**: `false`

- **`bundleSingleFile`**:
    - **Description**: Bundle the plugin entry into a single file (disables code splitting).
    - **Default**: `false`

- **`sourcemap`**:
    - **Description**: Generates the sourcemap for the compiled files.
    - **Default**: `false`

## Steps

1. **Check out the repository**:
   Uses the `actions/checkout@v4` action to check out the repository.

2. **Set up Node.js**:
   Uses the `actions/setup-node@v4` action to set up a specified version of Node.js.

3. **Install dependencies**:
   Runs `bun install` to install the project's dependencies with frozen lockfile settings.

4. **Build project**:
   Builds the project using `bun ncc` (or `esbuild` when `bundleSingleFile` is enabled).

6. **Update manifest configuration JSON**:
   Updates the `manifest.json` file with plugin metadata derived from code exports and `package.json`.

7. **Format manifest using Prettier**:
   Installs Prettier and formats the `manifest.json` file and other project files.

8. **Commit and Push changes**:
   Configures Git, adds the updated files to the commit, and pushes the changes to the repository.

## Usage Example

```yaml
name: Update Manifest and Commit Changes

on:
  push:

jobs:
  update-manifest:
    runs-on: ubuntu-latest
    steps:
      - name: Update Manifest and Commit Changes
        uses: ubiquity-os/action-deploy-plugin@main
        with:
          manifestPath: ${{ github.workspace }}/manifest.json
          schemaPath: ${{ github.workspace }}/src/types/plugin-input.ts
          pluginEntry: ${{ github.workspace }}/src/index.ts
          commitMessage: "chore: updated manifest.json and dist build"
          nodeVersion: "20.10.0"
        env:
          APP_ID: ${{ secrets.APP_ID }}
          APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Environment Variables

### Required

- **`GITHUB_TOKEN`**: A GitHub token with repository permissions. This is automatically provided by GitHub Actions and does not require manual setup.

### Optional

If GitHub App authentication is to be used, the following environment variables are needed:
- **`APP_ID`**: The GitHub App ID.
- **`APP_PRIVATE_KEY`**: The GitHub App private key.

When `APP_ID` and `APP_PRIVATE_KEY` are provided, the action will use GitHub App authentication. If they are not provided, the action will default to using `GITHUB_TOKEN`.

## Manifest Generation

The action auto-generates `manifest.json` fields from code exports and `package.json`. This keeps the manifest in sync with the source code and avoids manual drift.

### Generated Fields

| Manifest field | Source | Export name |
|---|---|---|
| `name` | `package.json` | — |
| `description` | `package.json` | — |
| `commands` | Schema module export | `pluginCommands` |
| `ubiquity:listeners` | Schema module export | `pluginListeners` |
| `skipBotEvents` | Schema module export | `pluginSkipBotEvents` |
| `configuration` | Schema module export | `pluginSettingsSchema` |
| `short_name` | Auto (`owner/repo@ref`) | — |
| `homepage_url` | Preserved from existing manifest | — |

### Plugin Schema Exports

Add the following named exports to your schema file (the file referenced by `schemaPath`, default `src/types/plugin-input.ts`):

```typescript
import { StaticDecode, Type as T } from "@sinclair/typebox";

// Plugin settings schema (existing, used for manifest.configuration)
export const pluginSettingsSchema = T.Object(
  { configurableResponse: T.String({ default: "Hello, world!" }) },
  { default: {} },
);

// Command definitions (used for manifest.commands)
export const pluginCommands = {
  hello: {
    description: "Say hello with an argument.",
    "ubiquity:example": "/hello world",
  },
};

// Webhook event listeners (used for manifest["ubiquity:listeners"])
export const pluginListeners = [
  "issue_comment.created",
  "issue_comment.edited",
];

// Whether to skip bot-triggered events (used for manifest.skipBotEvents)
export const pluginSkipBotEvents = true;

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;
```

### Backward Compatibility

All new exports are optional. If an export is missing, the action will:

- Preserve any existing value in `manifest.json`
- Emit a warning in the CI log

Plugins that only export `pluginSettingsSchema` will continue to work exactly as before.

### Package.json Fields

Ensure your plugin's `package.json` includes `name` and `description`:

```json
{
  "name": "my-plugin",
  "description": "What this plugin does."
}
```

If either field is absent or empty, the existing manifest value is preserved and a warning is emitted.

## Features

- Clones the repository and sets up Node.js and Bun.
- Installs project dependencies using Bun.
- Builds the project using `@vercel/ncc` via Bun.
- Auto-generates manifest metadata from code exports and `package.json`.
- Formats the project files using Prettier via Bun.
- Commits and pushes changes to the repository.
