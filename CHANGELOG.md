# Changelog

## [0.1.7](https://github.com/KATT/raf-query/compare/0.1.6...0.1.7) (2026-10-13)

- validate search params with a zod schema in the README ([#36](https://github.com/KATT/raf-query/issues/36)) ([9142236](https://github.com/KATT/raf-query/commit/9142236f611deb0fdf9db5f7e2847bccad89e841))

## [0.1.6](https://github.com/KATT/raf-query/compare/0.1.5...0.1.6) (2026-10-12)

- one file per decision, and alternatives in the PR template ([#34](https://github.com/KATT/raf-query/issues/34)) ([e60d30b](https://github.com/KATT/raf-query/commit/e60d30bc99452eec7178fa2a6c7598987fe5254c)), references [#24](https://github.com/KATT/raf-query/issues/24) [#25](https://github.com/KATT/raf-query/issues/25) [#26](https://github.com/KATT/raf-query/issues/26) [#27](https://github.com/KATT/raf-query/issues/27) [#28](https://github.com/KATT/raf-query/issues/28) [#33](https://github.com/KATT/raf-query/issues/33) [#26](https://github.com/KATT/raf-query/issues/26) [#N](https://github.com/KATT/raf-query/issues/N) [#26](https://github.com/KATT/raf-query/issues/26) [#16](https://github.com/KATT/raf-query/issues/16) [#23](https://github.com/KATT/raf-query/issues/23) [#31](https://github.com/KATT/raf-query/issues/31) [#19](https://github.com/KATT/raf-query/issues/19) [#28](https://github.com/KATT/raf-query/issues/28) [#33](https://github.com/KATT/raf-query/issues/33)

## [0.1.5](https://github.com/KATT/raf-query/compare/0.1.4...0.1.5) (2026-10-12)

- measure bundle size against TanStack Query ([#33](https://github.com/KATT/raf-query/issues/33)) ([51606b3](https://github.com/KATT/raf-query/commit/51606b3be47a9a078fc4a81355fd952861f51d81)), references [pre-#23](https://github.com/pre-/issues/23) [#23](https://github.com/KATT/raf-query/issues/23) [Pre-#23](https://github.com/Pre-/issues/23)

## [0.1.4](https://github.com/KATT/raf-query/compare/0.1.3...0.1.4) (2026-10-12)

### Features

- **core:** add per-query meta ([#26](https://github.com/KATT/raf-query/issues/26)) ([863c915](https://github.com/KATT/raf-query/commit/863c915d884bdfa3bcb3053da348d51aa0e697cf))

## [0.1.3](https://github.com/KATT/raf-query/compare/0.1.2...0.1.3) (2026-10-12)

### Features

- **core:** cancel requests nobody reads anymore ([#27](https://github.com/KATT/raf-query/issues/27)) ([c3c1e4b](https://github.com/KATT/raf-query/commit/c3c1e4bb9250164b6df17d7d4b7bd4043f908961))

## [0.1.2](https://github.com/KATT/raf-query/compare/0.1.1...0.1.2) (2026-10-12)

### Features

- add isFetching(filter?) and useIsFetching(filter?) ([#25](https://github.com/KATT/raf-query/issues/25)) ([70c3b98](https://github.com/KATT/raf-query/commit/70c3b981027f717b1d619d5a2b23822f685c032a))

## [0.1.1](https://github.com/KATT/raf-query/compare/0.1.0...0.1.1) (2026-10-12)

### Features

- **core:** add predicate to QueryFilter ([#24](https://github.com/KATT/raf-query/issues/24)) ([c0b9c18](https://github.com/KATT/raf-query/commit/c0b9c1829cb3b6446f765b151e520f0195af5276))

## [0.1.0](https://github.com/KATT/raf-query/compare/0.0.19...0.1.0) (2026-10-12)

### ⚠ BREAKING CHANGES

- Effect-native engine; core exposes only Effect APIs ([#23](https://github.com/KATT/raf-query/issues/23))
- **core:** make QueryObserver an Effect-style data type ([#29](https://github.com/KATT/raf-query/issues/29))

- **core:** make QueryObserver an Effect-style data type ([#29](https://github.com/KATT/raf-query/issues/29)) ([50fbb45](https://github.com/KATT/raf-query/commit/50fbb45bf3edcaa83673e2177894a76bdf76560b))
- Effect-native engine; core exposes only Effect APIs ([#23](https://github.com/KATT/raf-query/issues/23)) ([8e0bb09](https://github.com/KATT/raf-query/commit/8e0bb09a63d644ede053f443406a521ff2613a6f))

### Features

- **core:** stream SSR dehydration as Effect APIs; integrations become thin edges ([#30](https://github.com/KATT/raf-query/issues/30)) ([6b2b570](https://github.com/KATT/raf-query/commit/6b2b5703f5463c0f3805c233cf4ead90df9efb76)), references [#29](https://github.com/KATT/raf-query/issues/29)
- typed services for Effect queries; QueryClient layer and dispose() ([#31](https://github.com/KATT/raf-query/issues/31)) ([6aeaa3d](https://github.com/KATT/raf-query/commit/6aeaa3d356f6483654729620ac26762508eb8fd8))

## [0.0.19](https://github.com/KATT/raf-query/compare/0.0.18...0.0.19) (2026-10-12)

### Features

- **core:** type the cache's promises as Thenable ([#21](https://github.com/KATT/raf-query/issues/21)) ([c0541b0](https://github.com/KATT/raf-query/commit/c0541b0c14e687f25d47f25fe457e49b135d8c06))

## [0.0.18](https://github.com/KATT/raf-query/compare/0.0.17...0.0.18) (2026-10-12)

### Bug Fixes

- **core:** allow undefined query data ([#22](https://github.com/KATT/raf-query/issues/22)) ([9b85e57](https://github.com/KATT/raf-query/commit/9b85e57bf2fed4413cdbc1b49f925cc60dad695f)), references [#20](https://github.com/KATT/raf-query/issues/20)

## [0.0.17](https://github.com/KATT/raf-query/compare/0.0.16...0.0.17) (2026-10-12)

### Features

- **core:** pause retries while the browser is offline ([#18](https://github.com/KATT/raf-query/issues/18)) ([a25c664](https://github.com/KATT/raf-query/commit/a25c664359fe7248cdc8d91a14d524e37b467c6c))

## [0.0.16](https://github.com/KATT/raf-query/compare/0.0.15...0.0.16) (2026-10-12)

### Bug Fixes

- **core:** don't revalidate cached data in server verbs ([#19](https://github.com/KATT/raf-query/issues/19)) ([0ed7d9f](https://github.com/KATT/raf-query/commit/0ed7d9fefd0b70a8aa9a85c8d2c309a9fed42903))

## [0.0.15](https://github.com/KATT/raf-query/compare/0.0.14...0.0.15) (2026-10-12)

- **agent-docs:** replace local ~/dev path with upstream React link ([#17](https://github.com/KATT/raf-query/issues/17)) ([79c0314](https://github.com/KATT/raf-query/commit/79c031475c3ed62ce5a07fb91d68733534e452b3))

## [0.0.14](https://github.com/KATT/raf-query/compare/0.0.13...0.0.14) (2026-10-12)

### Features

- tracked query results via a core QueryObserver, like TanStack Query ([#13](https://github.com/KATT/raf-query/issues/13)) ([7b99b47](https://github.com/KATT/raf-query/commit/7b99b4704be110c999b41277afd5dac4c515f45f))

## [0.0.13](https://github.com/KATT/raf-query/compare/0.0.12...0.0.13) (2026-10-12)

### Features

- useQuery returns data for handles from ensure ([#16](https://github.com/KATT/raf-query/issues/16)) ([a50b8fd](https://github.com/KATT/raf-query/commit/a50b8fdc51b952341377d4b55f25ebb6b21d39e1))

## [0.0.12](https://github.com/KATT/raf-query/compare/0.0.11...0.0.12) (2026-10-12)

- **examples:** move the shared db and ui packages into examples/.shared ([#14](https://github.com/KATT/raf-query/issues/14)) ([fccdc7b](https://github.com/KATT/raf-query/commit/fccdc7bb8075ce2fb0cdbe07b26b36f2ace2bd9c))

## [0.0.11](https://github.com/KATT/raf-query/compare/0.0.10...0.0.11) (2026-10-12)

### Features

- **core:** structurally share new data with the old (structuralSharing) ([#15](https://github.com/KATT/raf-query/issues/15)) ([bf4392a](https://github.com/KATT/raf-query/commit/bf4392a56936ead6fb8b2726981cb19dadf51304))

## [0.0.10](https://github.com/KATT/raf-query/compare/0.0.9...0.0.10) (2026-10-12)

- move the TanStack Query experiment into .experimental folders ([#12](https://github.com/KATT/raf-query/issues/12)) ([e9613a6](https://github.com/KATT/raf-query/commit/e9613a608f100fb17de6baf37c0f1fcfa479e909))

## [0.0.9](https://github.com/KATT/raf-query/compare/0.0.8...0.0.9) (2026-10-12)

### Bug Fixes

- **examples:** let the client pick new comment ids ([#9](https://github.com/KATT/raf-query/issues/9)) ([de3a723](https://github.com/KATT/raf-query/commit/de3a7238b2568458a9771450a8c94d82576f5f7d))

## [0.0.8](https://github.com/KATT/raf-query/compare/0.0.7...0.0.8) (2026-10-12)

- rename the TanStack Query experiment to make clear it's experimental and unpublished ([#11](https://github.com/KATT/raf-query/issues/11)) ([146c3be](https://github.com/KATT/raf-query/commit/146c3be5034f8c4c642ea9faea693a7558ca4aac))

## [0.0.7](https://github.com/KATT/raf-query/compare/0.0.6...0.0.7) (2026-10-12)

### Features

- **react:** add @raf-query/react/devtools ([#7](https://github.com/KATT/raf-query/issues/7)) ([e325d76](https://github.com/KATT/raf-query/commit/e325d76305e29f935228a2dbad6834b0309229e4))

## [0.0.6](https://github.com/KATT/raf-query/compare/0.0.5...0.0.6) (2026-10-12)

- experimental @raf-query/tanstack-react-query on TanStack Query ([#8](https://github.com/KATT/raf-query/issues/8)) ([9d909c4](https://github.com/KATT/raf-query/commit/9d909c46ca030fd465d7af0fcd9591818356dd80))

## [0.0.5](https://github.com/KATT/raf-query/compare/0.0.4...0.0.5) (2026-10-12)

- **examples:** use Zod instead of Effect Schema ([#6](https://github.com/KATT/raf-query/issues/6)) ([7068cbe](https://github.com/KATT/raf-query/commit/7068cbe95e693787f22908b0ed678f6b7b05a550))

### Bug Fixes

- **react:** HydrationBoundary defers newer data for entries already on screen ([#5](https://github.com/KATT/raf-query/issues/5)) ([881a535](https://github.com/KATT/raf-query/commit/881a53544f65e2ffe858a0d010d7109427b93d55))

## [0.0.4](https://github.com/KATT/raf-query/compare/0.0.3...0.0.4) (2026-10-12)

### Features

- @raf-query/core, @raf-query/react and the example apps ([#1](https://github.com/KATT/raf-query/issues/1)) ([3881014](https://github.com/KATT/raf-query/commit/3881014b7f07d17d733256e184b627ead1f5788b))

## [0.0.3](https://github.com/KATT/raf-query/compare/0.0.2...0.0.3) (2026-10-12)

- lint-fix staged files in pre-commit hook ([#2](https://github.com/KATT/raf-query/issues/2)) ([858a4e0](https://github.com/KATT/raf-query/commit/858a4e02563daec4c6de9a07d438f03573d0339b))

## [0.0.2](https://github.com/KATT/raf-query/compare/0.0.1...0.0.2) (2026-10-12)

### Bug Fixes

- resolve workspace packages from source ([f03a57f](https://github.com/KATT/raf-query/commit/f03a57f0d54dbd66d947a0ee97dbb762bddca970))

## 0.0.1 (2026-10-12)

- Initial release of `@raf-query/core` and `@raf-query/react` (placeholder packages; reserves the names on npm).
