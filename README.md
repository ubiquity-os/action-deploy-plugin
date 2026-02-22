# @ubiquity-os/action-deploy-plugin

Builds a Ubiquity plugin, generates `manifest.json` metadata from source TypeScript entrypoint contracts, and publishes generated outputs to an artifact branch.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `action` | No | `publish` | `publish` writes generated files to an artifact branch; `delete` removes the paired artifact branch. |
| `manifestPath` | No | `${{ github.workspace }}/manifest.json` | Path to the target manifest file. |
| `schemaPath` | No | `${{ github.workspace }}/src/types/plugin-input.ts` | Source schema entrypoint used for build artifacts. |
| `pluginEntry` | No | `${{ github.workspace }}/src/index.ts` | Plugin runtime entrypoint used during build. |
| `commitMessage` | No | `chore: [skip ci] updated manifest.json and dist build` | Commit message for generated changes. |
| `sourceRef` | No | `${{ github.event.workflow_run.head_branch || github.ref_name }}` | Source branch used for `short_name` and artifact branch mapping. |
| `artifactPrefix` | No | `dist/` | Prefix for artifact branch names (`dist/<sourceRef>`). |
| `nodeVersion` | No | `24.11.0` | Node version used by the action. |
| `treatAsEsm` | No | `false` | Replaces `__dirname` with `import.meta.dirname` in built output. |
| `bundleSingleFile` | No | `false` | Enables single-file esbuild bundling. |
| `sourcemap` | No | `false` | Generates source maps for build output. |
| `skipBotEvents` | No | `true` | Sets `manifest.skipBotEvents` (`true`/`false`). |
| `excludeSupportedEvents` | No | `""` | Comma-separated listener events to remove from generated `ubiquity:listeners`. |

## Artifact Branch Model

- Source branch `R` maps to artifact branch `dist/R`.
- If `sourceRef` already starts with `dist/`, it is used as-is (no `dist/dist/...`).
- Generated files are committed to the artifact branch only:
  - `manifest.json` at branch root
  - build outputs under `dist/**`
- The artifact branch tree is reduced to generated outputs only (`manifest.json` and `dist/**`).
- Source branches no longer receive generated `dist/**` or generated `manifest.json` commits.

## Manifest Generation Contract

The action derives metadata from **source TypeScript modules** by inspecting the plugin entrypoint call:

- `createPlugin<TConfig, TEnv, TCommand, TSupportedEvents>(...)` (preferred)
- `createActionsPlugin<TConfig, TEnv, TCommand, TSupportedEvents>(...)` (fallback)

### Required source contract

1. The entrypoint must use explicit generics.
2. The options object must include a direct `settingsSchema` property.
3. `TCommand` must be either:
   - `null`, or
   - a type alias declared as `StaticDecode<typeof X>` or `Static<typeof X>`.
4. `TSupportedEvents` must resolve to string-literal events (direct union or traceable alias).

### Generated manifest fields

| Field | Source |
| --- | --- |
| `name` | `package.json#name` |
| `description` | `package.json#description` |
| `short_name` | `${repository}@${ref}` |
| `configuration` | runtime value referenced by `settingsSchema` |
| `commands` | runtime schema inferred from `TCommand` (or omitted when `TCommand = null`) |
| `ubiquity:listeners` | string literals resolved from `TSupportedEvents`, minus `excludeSupportedEvents` |
| `skipBotEvents` | action input `skipBotEvents` (default `true`) |

### Strict failures (non-zero exit)

The manifest script fails immediately when:

1. No valid entrypoint callsite is found.
2. Multiple `createPlugin` callsites are found.
3. `settingsSchema` is missing from options.
4. `TCommand` is non-null and not traceable to `StaticDecode<typeof ...>` / `Static<typeof ...>`.
5. `TSupportedEvents` cannot be resolved to string literals.
6. `excludeSupportedEvents` includes unknown events.

## Event Exclusion

`excludeSupportedEvents` uses exact string matches only.

Example:

```yaml
with:
  excludeSupportedEvents: "issues.labeled,pull_request.opened"
```

## Local Testing

Run manifest generation locally against any plugin project:

```bash
node .github/scripts/update-manifest.js /absolute/path/to/plugin-project
```

This command reads source under `src/`, updates `manifest.json`, and formats it with Prettier.
