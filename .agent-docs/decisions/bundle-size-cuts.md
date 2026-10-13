# Bundle size cuts (human asked)

- Human: minimise bundle size, keep the Effect integration (subpaths are fine), cut Effect except in that entrypoint. The simplest fixture app went from 29.26 to 6.76 kB gzip, from src and `dist/`. Numbers: [bundle-size.md](../bundle-size.md); the engine: [promise-engine.md](./promise-engine.md).
- **The default entries import no runtime `effect`.** `import type` only, and own helpers where a tiny Effect one would pull its module in (`predicate.ts` instead of `effect/Predicate`). `pnpm bundle-size` shows Effect's share per app; it must stay 0 for the non-Effect fixtures.
- **Rules that keep the `/effect` side small:**
  - Not-always-used APIs are module functions, not members of a service object, because object members never shake. `QueryCache.watch` / `events` / `dehydrate` / `hydrate` / `dehydrateStream` / `hydrateStream` take the cache (`effect/cache.ts`).
  - Top-level calls (`Context.Service`, `Effect.fnUntraced`, `Context.Reference`) carry `/*#__PURE__*/`.
  - Avoid `Effect.ignore` / `logError` (logger plus cause pretty-printing, ~2 kB), `withSpan` (tracer, ~1.5 kB), `RcRef` and `FiberMap` in code every Effect user reaches.
  - `Schedule` ships only with `retrySchedule` and `Layer` only with `fromLayer`.
- **`dist/` is built with `tsc -p tsconfig.build.json`**, not `vp pack`: rolldown compiles `export * as X` to an `__exportAll` getter object that keeps the whole namespace. `tsc` keeps it an ESM re-export, as effect's own `dist/` does. Check with `pnpm build && pnpm bundle-size --dist`.
- **`@raf-query/react/tanstack-router` has a `browser` export condition** pointing at a client-only module (`tanstack-router-browser.ts`; shared half in `tanstack-router-shared.ts`).
  - Server runtimes are listed first (`workerd`, `worker`, `node`, `deno`, `bun`), since Cloudflare builds also set `browser`. Router-core's `isServer` export orders them the same way.
  - Lost: a runtime `router.isServer` branch, or router-core's build-time `isServer`, in one module. Neither shook: rolldown keeps the server branch's imports until minification, which can't drop calls whose pure annotations were lost.
- `tooling/bundle-size/src/analyze.ts` lists one fixture app's modules by size (`node src/analyze.ts [export] [module] [--top N]`). Start there after `measure.ts` shows a change.
