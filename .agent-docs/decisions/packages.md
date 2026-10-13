# Two packages, React-agnostic core

- `@raf-query/core` (framework-agnostic, mirrors `@tanstack/query-core`) and `@raf-query/react` (bindings, re-exports core — apps install only this).
- **Core is Effect-only** (human, 2026-10-12: "it's okay if the core lib _only_ exposes effect-like apis… react is the only consumer… as exact as possible"). Core exports the `QueryCache` service, whose verbs are Effects with exact types; the Promise `QueryClient`, `dehydrate(client)` / `hydrate(client)` and `allKeyed` live in `@raf-query/react` (`src/client.ts`). Sync access during render follows Effect's `*Unsafe` naming (`getQueryUnsafe`, `Query.getUnsafe`, `Query.readUnsafe`, `Query.subscribeUnsafe`).
- Framework integrations are subpath exports of `@raf-query/react` (`/tanstack-router`, `/rsc`, `/next`), not separate packages.
- **Lockstep versions:** both packages always share a version and release together.
- `@raf-query/react` depends on `@raf-query/core` via `workspace:*`, which `pnpm pack` publishes as the exact lockstep version. `react` is a peer (`^19.2.0`). Both depend on `effect` through the catalog, which is a caret range (`^4.0.1`) because `pnpm pack` publishes the catalog value as-is and an exact pin would duplicate Effect in apps.
