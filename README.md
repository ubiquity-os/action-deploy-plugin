# @ubiquity-os/action-deploy-plugin

Builds a Ubiquity plugin, generates `manifest.json` metadata from source TypeScript entrypoint contracts, formats output, and commits/pushes changes.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `manifestPath` | No | `${{ github.workspace }}/manifest.json` | Path to the target manifest file. |
| `schemaPath` | No | `${{ github.workspace }}/src/types/plugin-input.ts` | Source schema entrypoint used for build artifacts. |
| `pluginEntry` | No | `${{ github.workspace }}/src/index.ts` | Plugin runtime entrypoint used during build. |
| `commitMessage` | No | `chore: [skip ci] updated manifest.json and dist build` | Commit message for generated changes. |
| `nodeVersion` | No | `24.11.0` | Node version used by the action. |
| `treatAsEsm` | No | `false` | Replaces `__dirname` with `import.meta.dirname` in built output. |
| `bundleSingleFile` | No | `false` | Enables single-file esbuild bundling. |
| `sourcemap` | No | `false` | Generates source maps for build output. |
| `skipBotEvents` | No | `true` | Sets `manifest.skipBotEvents` (`true`/`false`). |
| `excludeSupportedEvents` | No | `""` | Comma-separated listener events to remove from generated `ubiquity:listeners`. |

## Manifest Generation Contract

The action derives metadata from **source TypeScript modules** by inspecting the plugin entrypoint call:

- `createPlugin<TConfig, TEnv, TCommand, TSupportedEvents>(...)` (preferred)
- `createActionsPlugin<TConfig, TEnv, TCommand, TSupportedEvents>(...)` (fallback)

### Required source contract

1. The entrypoint must use explicit generics.
2. `TConfig` must be a traceable type alias declared as `StaticDecode<typeof X>` or `Static<typeof X>`.
3. `TCommand` must be either:
   - `null`, or
   - a type alias declared as `StaticDecode<typeof X>` or `Static<typeof X>`.
4. `TSupportedEvents` must resolve to string-literal events (direct union or traceable alias).
5. `settingsSchema` in options is optional, but if present it must be statically resolvable (direct property or via object spread chains).

### Generated manifest fields

| Field | Source |
| --- | --- |
| `name` | `package.json#name` |
| `description` | `package.json#description` |
| `short_name` | `${repository}@${ref}` |
| `configuration` | runtime schema resolved from `TConfig` (`StaticDecode<typeof X>` / `Static<typeof X>`), validated against options `settingsSchema` when present |
| `commands` | runtime schema inferred from `TCommand` (or omitted when `TCommand = null`) |
| `ubiquity:listeners` | string literals resolved from `TSupportedEvents`, minus `excludeSupportedEvents` |
| `skipBotEvents` | action input `skipBotEvents` (default `true`) |

### Strict failures (non-zero exit)

The manifest script fails immediately when:

1. No valid entrypoint callsite is found.
2. Multiple `createPlugin` callsites are found.
3. `TConfig` is not traceable to `StaticDecode<typeof ...>` / `Static<typeof ...>` and options `settingsSchema` cannot be resolved.
4. `TCommand` is non-null and not traceable to `StaticDecode<typeof ...>` / `Static<typeof ...>`.
5. `TSupportedEvents` cannot be resolved to string literals.
6. `excludeSupportedEvents` includes unknown events.
7. `TConfig`-derived settings schema conflicts with options `settingsSchema`.

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
