# Bundle size cuts (human asked)

- Human: minimise bundle size, keep the Effect integration (subpaths are fine), keep the engine Effect-native. Simplest fixture app 29.26 → 20.38 kB gzip, from src and `dist/`. Numbers and remaining levers: [bundle-size.md](../bundle-size.md).
- **Rules that keep apps small**:
  - Not-always-used APIs are module functions, not members of a service object: object members never shake. `QueryCache.watch` / `events` / `dehydrate` / `hydrate` / `dehydrateStream` / `hydrateStream` take the cache (`cache.ts`).
  - Top-level calls (`Context.Service`, `Effect.fnUntraced`, `Context.Reference`) carry `/*#__PURE__*/`.
  - Default paths avoid:
    - `Effect.ignore` / `logError` (logger plus cause pretty-printing, ~2 kB);
    - `withSpan` (tracer, ~1.5 kB; opt in with `wrapRequest: traceRequest`, `tracing.ts`);
    - `Effect.all` with concurrency (~1 kB; `settleAll` forks children and joins);
    - `RcRef` and `FiberMap` (`fibers.ts`);
    - Schedule's driver (`retry.ts`).
- **`dist/` is built with `tsc -p tsconfig.build.json`**, not `vp pack`: rolldown compiles `export * as X` to an `__exportAll` getter object that keeps the whole namespace. `tsc` keeps it an ESM re-export, as effect's own `dist/` does. Check with `pnpm build && pnpm bundle-size --dist`.
- **`@raf-query/react/tanstack-router` has a `browser` export condition** pointing at a client-only module (`tanstack-router-browser.ts`; shared half in `tanstack-router-shared.ts`).
  - Server runtimes are listed first (`workerd`, `worker`, `node`, `deno`, `bun`), since Cloudflare builds also set `browser`. Router-core's `isServer` export orders them the same way.
  - Lost: a runtime `router.isServer` branch, or router-core's build-time `isServer`, in one module. Neither shook: rolldown keeps the server branch's imports until minification, which can't drop calls whose pure annotations were lost.
- Not taken (API changes, ask first): `Schedule` retries behind a wrapper (~0.8 kB), `QueryClient`'s `layer` behind a separate constructor (~0.4 kB).
- `tooling/bundle-size/src/analyze.ts` lists one fixture app's modules by size (`node src/analyze.ts [export] [module] [--top N]`). Start there after `measure.ts` shows a change.
