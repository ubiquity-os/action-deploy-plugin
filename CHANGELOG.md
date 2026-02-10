# Changelog

## [1.2.0](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.1.4...v1.2.0) (2026-02-10)


### Features

* add short_name to manifest in action.yml ([48a04b5](https://github.com/ubiquity-os/action-deploy-plugin/commit/48a04b59cd97476856b89b641d9d0a1992d98b40))
* add single-file bundling option ([aafef9a](https://github.com/ubiquity-os/action-deploy-plugin/commit/aafef9aaaf2307830a6a45e95235574ab99c42a3))
* derive manifest metadata from plugin entrypoint contract ([8f71e7d](https://github.com/ubiquity-os/action-deploy-plugin/commit/8f71e7dd4710324537021fbb6e78ddb4ddb4c57b))
* extract listeners from SupportedEvents type and add local testing mode ([e4b835d](https://github.com/ubiquity-os/action-deploy-plugin/commit/e4b835d35396ecb6485a906059dde4a18d5f1c2a))
* generate manifest metadata from code exports and package.json ([4eca529](https://github.com/ubiquity-os/action-deploy-plugin/commit/4eca5299f3e7d2e52fe2e02de10342c32a73b406))
* generate manifest metadata from code exports and package.json ([40cb3a2](https://github.com/ubiquity-os/action-deploy-plugin/commit/40cb3a2568eabbfca8a25f543dcd910df363651e)), closes [#27](https://github.com/ubiquity-os/action-deploy-plugin/issues/27)
* set skipBotEvents from action input ([1112ffc](https://github.com/ubiquity-os/action-deploy-plugin/commit/1112ffc8fc099c8386b5b8cb24399d4811fc68b4))


### Bug Fixes

* address latest review comments ([8231e4e](https://github.com/ubiquity-os/action-deploy-plugin/commit/8231e4e5ba3ca958edc662ab62ced7df25b8d3fb))
* address PR review feedback ([22c38e1](https://github.com/ubiquity-os/action-deploy-plugin/commit/22c38e1e4b6c24dc0801e8a11aa7258cddd0c08e))
* changed commit and code sign to use a dedicated action and CLI ([9b62c92](https://github.com/ubiquity-os/action-deploy-plugin/commit/9b62c9287b61ea1a9448e56f4de469f16c0ae512))
* **ci:** use npm install in tests workflow ([a67fda0](https://github.com/ubiquity-os/action-deploy-plugin/commit/a67fda0bdb670ac092b9d8d1748b70863ef0e632))
* ensure node imports have proper prefixes ([ab0874b](https://github.com/ubiquity-os/action-deploy-plugin/commit/ab0874ba7bc3ed90042fc738fabd882eec0ad02a))
* fixed ESM packge.json ([16f8202](https://github.com/ubiquity-os/action-deploy-plugin/commit/16f82026932cc7fe8d2e81b5f822b2400a757e7b))
* generate manifest metadata from source TypeScript schemas ([1a761af](https://github.com/ubiquity-os/action-deploy-plugin/commit/1a761af6d970ba35f1e3e10f5cab82a623f7ced9))
* large files get committed properly ([092a224](https://github.com/ubiquity-os/action-deploy-plugin/commit/092a2244991c4d04639d545a8fe3ef0ff7f8529e))
* remove glob dependency from manifest updater ([260d50c](https://github.com/ubiquity-os/action-deploy-plugin/commit/260d50cdf01f96a1cc24aed1ee24b395a179ff75))
* update node imports in reassembly-esm.js ([cb34619](https://github.com/ubiquity-os/action-deploy-plugin/commit/cb34619ef3c62e8b72d6ba19f2b28db3303dc08e))
* use script instead of inlined js code and split files by commit ([9f705f3](https://github.com/ubiquity-os/action-deploy-plugin/commit/9f705f34a7e2434a38bdc084c3650f10706f6b3a))

## [1.1.4](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.1.3...v1.1.4) (2025-03-26)


### Bug Fixes

* added cjs to included files ([3b105ab](https://github.com/ubiquity-os/action-deploy-plugin/commit/3b105ab7a49cdf4a1c0da05bec5aa8607ce81ccb))
* added cjs to included files ([3a9b61a](https://github.com/ubiquity-os/action-deploy-plugin/commit/3a9b61a34ca9b9c363eb625f2ca9694481b806ab))
* test installation with bun ([a171649](https://github.com/ubiquity-os/action-deploy-plugin/commit/a171649c239faa695fe53274266b12c5aba12e3a))
* test installation with bun ([40e4ce1](https://github.com/ubiquity-os/action-deploy-plugin/commit/40e4ce145f5aa1753252b116a68d984dfeb32b97))
* update action.yml ([e78f69e](https://github.com/ubiquity-os/action-deploy-plugin/commit/e78f69e408cdd0ead7963e3a9e3cf1789ceec6d5))

## [1.1.3](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.1.2...v1.1.3) (2024-11-07)


### Bug Fixes

* add ESM support by replacing __dirname ([b722932](https://github.com/ubiquity-os/action-deploy-plugin/commit/b7229322141033319fd4a872e56f2cfa7cfc59b4))
* adding all generated files ([f11d086](https://github.com/ubiquity-os/action-deploy-plugin/commit/f11d08692dbc7939f796383fa09fdd26ac7b87ce))
* adding sourcemap option ([4bf048d](https://github.com/ubiquity-os/action-deploy-plugin/commit/4bf048d6f4307c9f45ddbf1efbd7403ff49c538b))
* command should run on linux env ([0bcd69a](https://github.com/ubiquity-os/action-deploy-plugin/commit/0bcd69aadb7150f82eb59d3310d5b216aa3a6b68))
* correct file addition logic in action.yml ([9690d25](https://github.com/ubiquity-os/action-deploy-plugin/commit/9690d25cf6f581b02f9b4ada6e76da993b8f2c3f))
* correct path for dist file in git tree ([789e396](https://github.com/ubiquity-os/action-deploy-plugin/commit/789e39659da2824c177131f0181b87083270b1fd))
* properly take all files ([b9fa926](https://github.com/ubiquity-os/action-deploy-plugin/commit/b9fa92646afdd9708ab428c3649ca78475038056))

## [1.1.2](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.1.1...v1.1.2) (2024-10-22)


### Bug Fixes

* **action:** refactor manifest update to use async/await ([90e7386](https://github.com/ubiquity-os/action-deploy-plugin/commit/90e7386d82f05a6f3f6575ca862a76507fefd352))
* call updateManifest function in action.yml ([5fac319](https://github.com/ubiquity-os/action-deploy-plugin/commit/5fac3191264c7f374d594adf0dd38eb40393d4d2))
* handle ESM and CJS module loading in action script ([33147cc](https://github.com/ubiquity-os/action-deploy-plugin/commit/33147cc8721f94c42a1ecb3834217a61cbf75f3a))
* rename output file to use .cjs extension ([4860686](https://github.com/ubiquity-os/action-deploy-plugin/commit/4860686466a97f6d514fa6d88714ca22586c0d07))
* replace async file operations with sync methods ([8e99285](https://github.com/ubiquity-os/action-deploy-plugin/commit/8e992851f2586567bf2180ae5f5a59f3266b8dc2))
* switch to bash script for pushing changes ([876b39b](https://github.com/ubiquity-os/action-deploy-plugin/commit/876b39b76dbfdb68dd27f773c1ab7d4a5c7e029c))
* update schema and plugin path extensions, remove ts compilation ([086a914](https://github.com/ubiquity-os/action-deploy-plugin/commit/086a9147e9b8ca942e8467ee6a02a1ab52a4cf8f))
* update schema and plugin path extensions, remove ts compilation ([6c4202b](https://github.com/ubiquity-os/action-deploy-plugin/commit/6c4202beb4cf0adce32ae8732b2566e5444648a2))

## [1.1.1](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.1.0...v1.1.1) (2024-10-15)


### Bug Fixes

* handle schema defaults and required fields correctly ([dc46486](https://github.com/ubiquity-os/action-deploy-plugin/commit/dc46486a0922f243c34a827b6db36556b1bc0a87))

## [1.1.0](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.0.0...v1.1.0) (2024-10-15)


### Features

* add GitHub packages to action setup ([5eb45f9](https://github.com/ubiquity-os/action-deploy-plugin/commit/5eb45f9a0a4b14b9ce79f135b56e7679f1392c1c))


### Bug Fixes

* switch to Octokit for commit and push ([45f54ee](https://github.com/ubiquity-os/action-deploy-plugin/commit/45f54eecb4ebda5eb8b0695e7e3d5b1b774e82d1))
* update default schema path to use .cjs extension ([d650040](https://github.com/ubiquity-os/action-deploy-plugin/commit/d650040c3cfd7178c69ac48e5bc9a0a548cde791))

## 1.0.0 (2024-10-10)


### Features

* add CODEOWNERS and enhance README.md ([24a312d](https://github.com/ubiquity-os/action-deploy-plugin/commit/24a312dc56c4b27fb22d88d75f21d2c9f570358a))


### Bug Fixes

* correct order of ncc build command options ([0bf5f26](https://github.com/ubiquity-os/action-deploy-plugin/commit/0bf5f26061de4aaca91924fc4d5b2a7fa0387a5b))
* remove rebase option during git pull ([ca46e9d](https://github.com/ubiquity-os/action-deploy-plugin/commit/ca46e9d8a785d6edc250a7f48c6974617bf6bee6))
* update bot email to use GitHub noreply address ([2c48b0c](https://github.com/ubiquity-os/action-deploy-plugin/commit/2c48b0ccb66cd14d8e22e3072e868ae4390e737e))
