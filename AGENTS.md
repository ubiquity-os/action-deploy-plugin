# AGENTS.md

## Project Overview

This is `@ubiquity-os/action-deploy-plugin`, a composite GitHub Action that automates building, manifest updating, and deploying Ubiquity OS plugins. It handles checkout, dependency installation, project building, manifest configuration updates, and signed git commits/pushes.

## Tech Stack

- **Language:** JavaScript/YAML (no TypeScript in this repo itself)
- **Runtime:** Node.js (default 24.11.0), Bun (package management)
- **Bundlers:** @vercel/ncc (default, code-split bundles) or esbuild (single-file mode)
- **Module System:** Supports both ESM and CommonJS plugins
- **Formatting:** Prettier 3.x
- **Dependencies:** `@actions/github`, `glob`, `prettier`

## Project Structure

```
action-deploy-plugin/
├── action.yml                    # Main action definition (composite steps)
├── .github/
│   ├── scripts/
│   │   ├── update-manifest.js    # Manifest generation from code exports + package.json
│   │   ├── push-changes.js       # GitHub API commit/push via Octokit
│   │   ├── reassembly-cjs.js     # CJS reassembly wrapper for dist/index.js
│   │   ├── reassembly-esm.js     # ESM reassembly wrapper with Node import fixes
│   │   └── __tests__/
│   │       └── update-manifest.test.js  # Unit tests for manifest generation
│   ├── workflows/
│   │   └── release-please.yml    # Automated releases via release-please
│   └── CODEOWNERS
├── package.json
└── README.md
```

## Build & Run

There is no local build step — this is a composite GitHub Action executed in CI. The action itself builds the _consuming_ plugin project:

1. Installs dependencies with `bun install`
2. Bundles the plugin using `bun ncc build` (or esbuild when `bundleSingleFile=true`)
3. Generates `manifest.json` from code exports and `package.json`
4. Commits and pushes via the GitHub API (signed commits)

## Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `manifestPath` | `$GITHUB_WORKSPACE/manifest.json` | Path to manifest.json |
| `schemaPath` | `$GITHUB_WORKSPACE/src/types/plugin-input.ts` | Plugin settings schema TS file |
| `pluginEntry` | `$GITHUB_WORKSPACE/src/index.ts` | Plugin entry file |
| `commitMessage` | `chore: [skip ci] updated manifest.json and dist build` | Git commit message |
| `nodeVersion` | `24.11.0` | Node.js version |
| `treatAsEsm` | `false` | Replace `__dirname` with `import.meta.dirname` |
| `bundleSingleFile` | `false` | Use esbuild single-file bundle |
| `sourcemap` | `false` | Generate sourcemaps |

## Testing

Unit tests use Node.js built-in `node:test` and `node:assert` (no external test framework needed).

```bash
node --test .github/scripts/__tests__/
```

Integration testing is done at the GitHub Actions workflow level by consuming repositories.

## Code Conventions

- camelCase for variables and functions
- Async/await for promise handling
- ESM imports preferred (`import x from "node:fs"`)
- Prettier for formatting manifest files
- No linter configured beyond Prettier

## Environment Variables

- `GITHUB_TOKEN` — provided automatically by GitHub Actions
- `GITHUB_WORKSPACE`, `GITHUB_REF_NAME` — GitHub Actions context
- `APP_ID`, `APP_PRIVATE_KEY` — optional, for GitHub App authentication

## Key Implementation Details

- Files >30MB are chunked during git operations
- Schema processing removes `required` fields for properties that have defaults (scoped to `configuration` only)
- ESM reassembly script patches bare Node.js built-in imports to `node:` prefixed imports
- The action copies the appropriate reassembly script (CJS or ESM) to `dist/index.js`
- Manifest generation extracts metadata from source TypeScript modules:
  - `pluginSettingsSchema` → `manifest.configuration`
  - `commandSchema` → `manifest.commands` (`commandSchema` may be a commands map or a TypeBox union)
- Manifest generation sets `manifest.skipBotEvents` from the action input `skipBotEvents` (default `true`)
- Schema module loading is Deno-first with Node fallbacks (including a lightweight Deno shim in Node)
- Source schema exports are loaded from `src/types/*.ts` modules
- The action scans TypeScript source for a `SupportedEvents` type alias and extracts the string literal union members as `manifest["ubiquity:listeners"]`
- `name` and `description` are read from the consuming plugin's `package.json`
- Missing exports emit warnings but do not fail the build (backward compatible); `skipBotEvents` always comes from action input/default
- Manifest field ordering is deterministic to avoid noisy diffs
- Local testing: `node .github/scripts/update-manifest.js /path/to/plugin-project`

## Release Process

Releases are automated via `release-please` on push to `main` or manual dispatch.
