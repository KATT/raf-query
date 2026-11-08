# Three packages, React-agnostic core

- `@raf-query/core` (framework-agnostic, mirrors `@tanstack/query-core`, no dependencies), `@raf-query/react` (bindings, re-exports core — apps install only this) and `@raf-query/boundary` (`QueryBoundary`, see [typed-errors.md](./typed-errors.md)).
- Optional parts are subpath exports, not packages: core's `/groups` (tags; `group` is on the main entry), `/hydration` and `/internal` (the kernel for bindings and the devtools, not a public API), and react's `/groups`, `/hydration`, `/devtools` and `/tanstack-router`. RSC and React Router need no integration entry: `QueryProvider` and `HydrationBoundary` are on the main entry.
- **Lockstep versions:** the packages always share a version and release together.
- `@raf-query/react` depends on `@raf-query/core` via `workspace:*`, which `pnpm pack` publishes as the exact lockstep version. `react` is a peer (`^19.2.0`); `@tanstack/react-router` is an optional peer for `/tanstack-router`.
- `@raf-query/boundary` has `@raf-query/core`, `@raf-query/react` and `react` as peers, so it shares the app's copies.
- No Effect at runtime: see [effect-scope.md](./effect-scope.md).
