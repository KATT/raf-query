# Two packages, React-agnostic core

- `@raf-query/core` (framework-agnostic, mirrors `@tanstack/query-core`) and `@raf-query/react` (bindings, re-exports core — apps install only this).
- **Core is Effect-only** (human, 2026-10-12: "it's okay if the core lib _only_ exposes effect-like apis… react is the only consumer… as exact as possible"). Core exports the `QueryCache` service, whose verbs are Effects with exact types; the Promise `QueryClient`, `dehydrate(client)` / `hydrate(client)` and `allKeyed` live in `@raf-query/react` (`src/client.ts`). Sync access during render follows Effect's `*Unsafe` naming (`getQueryUnsafe`, `Query.getUnsafe`, `Query.readUnsafe`, `Query.subscribeUnsafe`).
- Framework integrations are subpath exports of `@raf-query/react` (`/tanstack-router`, `/rsc`), not separate packages.
- **Lockstep versions:** both packages always share a version and release together.
- `@raf-query/react` depends on `@raf-query/core` via `workspace:*`, which `pnpm pack` publishes as the exact lockstep version. `react` is a peer (`^19.2.0`).
- **`effect` is a required peer (`^4.0.0`) of both packages**, plus a `catalog:` devDependency for the workspace. A regular dependency, even a caret range, leaves deduping to the package manager, and a second Effect splits module-level state (service tags, default runtime) as well as adding size. npm, pnpm and Bun auto-install required peers, so promise-only apps still need no extra step; Yarn users add `effect` themselves. `vp pack` keeps peers external, so the dev copy isn't bundled.
