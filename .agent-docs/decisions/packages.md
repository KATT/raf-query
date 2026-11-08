# Three packages, React-agnostic core

- `@raf-query/core` (framework-agnostic, mirrors `@tanstack/query-core`, no dependencies), `@raf-query/react` (bindings, re-exports core — apps install only this) and `@raf-query/boundary` (`QueryBoundary`, see [typed-errors.md](./typed-errors.md)).
- Optional parts are exports of the main entry, not packages or subpaths ([one-entry-point.md](./one-entry-point.md)): hydration and the devtools tree-shake away unused. The subpaths left are core's `/internal` (the kernel for bindings and the devtools, not a public API) and react's `/tanstack-router`. RSC and React Router need no integration entry: `QueryClientProvider` and `HydrationBoundary` are on the main entry.
- **Lockstep versions:** the packages always share a version and release together.
- `@raf-query/react` depends on `@raf-query/core` via `workspace:*`, which `pnpm pack` publishes as the exact lockstep version. `react` is a peer (`^19.2.0`); `@tanstack/react-router` is an optional peer for `/tanstack-router`.
- `@raf-query/boundary` has `@raf-query/core`, `@raf-query/react` and `react` as peers, so it shares the app's copies.
- No Effect at runtime: see [effect-scope.md](./effect-scope.md).
