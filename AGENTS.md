# AGENTS.md

## Project Overview

`@ubiquity-os/action-deploy-plugin` is a composite GitHub Action that:

1. builds a plugin project,
2. generates `manifest.json` metadata from source TypeScript entrypoint contracts,
3. formats output,
4. commits and pushes manifest/dist changes.

## Tech Stack

- Language: JavaScript + YAML
- Runtime: Node.js (default `24.11.0`), Bun, Deno-aware manifest loader
- Build tools: `@vercel/ncc` (default) or `esbuild` (single-file mode)
- Test runner: Node built-in `node:test`
- Formatting: Prettier

## Structure

```
action-deploy-plugin/
├── action.yml
├── AGENTS.md
├── README.md
├── package.json
└── .github/
    ├── scripts/
    │   ├── update-manifest.js
    │   ├── push-changes.js
    │   ├── reassembly-cjs.js
    │   ├── reassembly-esm.js
    │   └── __tests__/update-manifest.test.js
    └── workflows/
        ├── tests.yml
        └── release-please.yml
```

## Manifest Detection Rules

Manifest metadata is derived from source entrypoint calls in `src/**/*.ts`:

- preferred: `createPlugin<TConfig, TEnv, TCommand, TSupportedEvents>(...)`
- fallback: `createActionsPlugin<TConfig, TEnv, TCommand, TSupportedEvents>(...)`

Required contract:

1. Explicit generics are mandatory.
2. Options object must include direct `settingsSchema`.
3. `TCommand` must be `null` or a type alias of `StaticDecode<typeof X>` / `Static<typeof X>`.
4. `TSupportedEvents` must resolve to string-literal events.

Strict failures (exit non-zero):

- no valid entrypoint,
- ambiguous entrypoints,
- missing `settingsSchema`,
- invalid command type contract,
- unsupported listeners contract,
- unknown `excludeSupportedEvents` names.

## Action Inputs Relevant to Manifest

- `skipBotEvents` (`true`/`false`, default `true`)
- `excludeSupportedEvents` (comma-separated exact event names, default empty)

## Local Development

Run tests:

```bash
npm test
```

Run manifest generation against a plugin project:

```bash
node .github/scripts/update-manifest.js /absolute/path/to/plugin-project
```
