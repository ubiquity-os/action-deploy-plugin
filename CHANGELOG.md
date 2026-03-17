# Changelog

## [1.3.3](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.3.2...v1.3.3) (2026-03-11)


### Bug Fixes

* **artifact:** include action metadata in dist branch payload ([5536f46](https://github.com/ubiquity-os/action-deploy-plugin/commit/5536f46f2e52ebffed2a17587da5891b51cde569))
* **artifact:** include compute workflow in dist payload ([21d41e4](https://github.com/ubiquity-os/action-deploy-plugin/commit/21d41e4b03df78204810e05af846e8c6c6707c98))
* **artifact:** include compute workflow in dist payload ([3ac390b](https://github.com/ubiquity-os/action-deploy-plugin/commit/3ac390b10610e51946c1bad92aa775b1c7456c51))
* **artifact:** include package and lock files in dist payload ([f8fe978](https://github.com/ubiquity-os/action-deploy-plugin/commit/f8fe97894eee26e02d39209e619584bc43fc7caf))
* **artifact:** include package and lock files in dist payload ([987beaa](https://github.com/ubiquity-os/action-deploy-plugin/commit/987beaabe2ede2a60ead18cc4e9814e6fbafb695))
* **artifact:** publish dist index.cjs entrypoint ([fe114c0](https://github.com/ubiquity-os/action-deploy-plugin/commit/fe114c037749c9cf925fa713b56ac8ad35f04eaf))
* **ci:** avoid heredoc parsing in CJS bridge generation ([5073aaf](https://github.com/ubiquity-os/action-deploy-plugin/commit/5073aafb31a4635ad6e95d3b034611ba7b152f16))
* **ci:** preserve skipBotEvents during publish ([f9906e5](https://github.com/ubiquity-os/action-deploy-plugin/commit/f9906e5c9ea6eef74ea3273bafcfc967d633a0e2))
* **ci:** reapply manifest before artifact publish ([0412531](https://github.com/ubiquity-os/action-deploy-plugin/commit/0412531be761f384f1328e8a0a8f4ea332299a06))
* **ci:** reapply manifest before artifact publish ([75fc321](https://github.com/ubiquity-os/action-deploy-plugin/commit/75fc3213ad57609f79d536042c07786f5fca79ab))
* **ci:** stabilize manifest publishing in composite action ([d394426](https://github.com/ubiquity-os/action-deploy-plugin/commit/d394426ac55907c74e0e61943103a978e3595a42))
* **ci:** stabilize manifest publishing in composite action ([d546c0b](https://github.com/ubiquity-os/action-deploy-plugin/commit/d546c0b5a0bc1e98996788bd2277c4cc3600e6a6))
* finalize manifest after build to preserve skipBotEvents ([04f39f3](https://github.com/ubiquity-os/action-deploy-plugin/commit/04f39f3be66cb242be9c5145716daab80b4be834))
* include action.yml in artifact branch payload ([9d3c21c](https://github.com/ubiquity-os/action-deploy-plugin/commit/9d3c21ce64407f0d4cddb6a6d49857fff3e6dda5))
* make artifact branch delete idempotent when branch is missing ([effd880](https://github.com/ubiquity-os/action-deploy-plugin/commit/effd880fb48994e0049d53362fa13cb631ec6b17))
* propagate skipBotEvents to install/build env ([c40abcd](https://github.com/ubiquity-os/action-deploy-plugin/commit/c40abcd771bc22e197d55820d90cc9f6587ef305))
* skip dist and tag refs in composite action ([#38](https://github.com/ubiquity-os/action-deploy-plugin/issues/38)) ([559de1c](https://github.com/ubiquity-os/action-deploy-plugin/commit/559de1cab0630ca9f45cf3847715153fdba56268))
* warn instead of failing when artifact branch is missing ([8066946](https://github.com/ubiquity-os/action-deploy-plugin/commit/8066946a5938b0149ee1fa300861d7fa919f824f))

## [1.3.2](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.3.1...v1.3.2) (2026-03-05)


### Bug Fixes

* **action:** default sourceRef for delete events ([126c3d4](https://github.com/ubiquity-os/action-deploy-plugin/commit/126c3d4015c9be86532b25412a492b3041dc648e))
* **action:** make sourceRef default delete-aware ([d2457d8](https://github.com/ubiquity-os/action-deploy-plugin/commit/d2457d8359d9520badafda4998d36eee6255b3c9))

## [1.3.1](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.3.0...v1.3.1) (2026-03-05)


### Bug Fixes

* **manifest:** convert single-object command schemas ([#32](https://github.com/ubiquity-os/action-deploy-plugin/issues/32)) ([75c41e9](https://github.com/ubiquity-os/action-deploy-plugin/commit/75c41e96fb31efa010caaaf8b6c90c4b602631d6))

## [1.3.0](https://github.com/ubiquity-os/action-deploy-plugin/compare/v1.2.0...v1.3.0) (2026-03-05)


### Features

* publish generated outputs to artifact branches ([507ada6](https://github.com/ubiquity-os/action-deploy-plugin/commit/507ada6b9a59620bd100b79ac09b186104e115de))
* publish generated outputs to artifact branches (issue [#320](https://github.com/ubiquity-os/action-deploy-plugin/issues/320)) ([4fde24c](https://github.com/ubiquity-os/action-deploy-plugin/commit/4fde24c3d4ecd2e356dd977158c1b40b7862c95c))


### Bug Fixes

* generate manifest before build in publish flow ([6b9e65e](https://github.com/ubiquity-os/action-deploy-plugin/commit/6b9e65e04f6461235d38ae7d90575b55e8465c11))
* keep artifact branch tree scoped to generated files ([9e89cff](https://github.com/ubiquity-os/action-deploy-plugin/commit/9e89cffa5d7ff10fa69e85e4860af8085b77a7c7))

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
