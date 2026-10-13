# Bundle size

Reference for when bundle size matters more. Measure with `pnpm bundle-size` (see [decisions/bundle-size-measurement.md](./decisions/bundle-size-measurement.md)).

## Current: Effect-native core, trimmed

Core exposes only Effect APIs (`QueryCache`, `Query`, `QueryObserver`, `Platform` namespaces); `@raf-query/react`'s `QueryClient` builds the cache with `QueryCache.make` and runs each verb with `Effect.runSync` / `runPromise`. `qc.effect` is the Effect-native cache itself. Every app bundles Effect's fiber runtime plus what the engine reaches on every request; streams, transfer, spans, the logger, `Schedule` retries (`retrySchedule`) and `Layer` (`fromLayer`, `@raf-query/react/effect`) only when used. The cuts and the rules behind them: [decisions/bundle-size-cuts.md](./decisions/bundle-size-cuts.md).

## Numbers (gzip, kB; `tooling/bundle-size` fixtures, Start example's bundler)

| App                                | TanStack Query | raf-query now | Effect-native before the cuts | Pre-#23 Effect engine | Pre-#23 Promise engine |
| ---------------------------------- | -------------: | ------------: | ----------------------------: | --------------------: | ---------------------: |
| Factory + prefetch + `useQuery`    |           9.77 |         19.24 |                         29.26 |                 16.75 |                   5.64 |
| + paged                            |          10.44 |         19.64 |                         29.65 |                 17.15 |                   6.04 |
| + action that invalidates          |          10.60 |         19.80 |                         29.81 |                 17.32 |                   6.21 |
| TanStack Router app                |          12.36 |         20.61 |                         31.44 |                 18.50 |                   7.41 |
| Effect `queryFn` + `retrySchedule` |              — |         20.48 |                         29.49 |                 16.93 |                  15.33 |
| Effect `queryFn` + `fromLayer`     |              — |         19.70 |                             — |                     — |                      — |

- `dist/` bundles the same as src now; before the cuts it was ~0.4 kB bigger (29.67 for the first app), and 23.25 with the first cuts but a `vp pack` build.
- **Effect's share of raf-query:** ~12.0 kB now; ~21.4 kB before the cuts; ~11.2 kB with the pre-#23 Effect engine plus `/effect` subpath; ~0.2 kB with the Promise engine.
- **Full `examples/tanstack-start` client JS:** 173.5 kB now, 185.3 kB before. The TanStack-backed copy is 163.1 kB.
- **Floor:** Effect's fiber runtime alone (`runPromiseExit(succeed(1))`) is ~7 kB gzip; with fork, gen, sleep, `Deferred` and `Scope` ~11.7 kB. Effect v4 has no lighter `Micro` runtime.

## Why it's big, and what's shakable

Effect v4 shakes per export (`sideEffects` lists only a schema file), and app-side `import { X }` / `import * as X` with static access both shake with Rolldown. What defeats it:

- **Anything reachable from the always-imported path.** Members of a service object (`QueryCache`'s methods), class properties built in a constructor, and engine code that runs on every request can't be shaken, whatever they import.
- **Top-level calls without `/*#__PURE__*/`** (`Context.Service(...)`, `Effect.fnUntraced(...)`, `Context.Reference(...)`).
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; even a constant-folded `isServer` left Queue/Stream residue after minification. Use export conditions (`browser`) for a separate module.
- **`export * as X` in a rolldown library build** (`vp pack` / tsdown): an `__exportAll` getter object keeps every member. Packages build with `tsc` for that reason.
- Dynamic access (`X[key]`) and re-exported `export *` keep everything.

## What's left

- What's left is mostly Effect's runtime floor (`internal/effect`, `core`, `Duration`, `Context`, `Equal`, `Hash`, `Scheduler`) and raf's own engine (`entry.ts`, `cache.ts`, `observer.ts`). Use `tooling/bundle-size/src/analyze.ts` to list modules by size.

## The Promise-engine experiment

Branch **`cursor/promise-engine-reference-16c7`** has a working engine on Promises + `AbortSignal` (retry loop, abortable `sleep` / `whenOnline`, `RetryStrategy` bridging `Schedule`s), with Effect APIs behind a `@raf-query/core/effect` subpath. It's built on the **pre-#23** core (`client.ts`, `query.ts`), so it can't be cherry-picked onto the Effect-native core; treat it as a design reference.

The human rejected it (2026-10-12): the internals were worse than the Effect version.

Trade-offs:

- **Effect engine:** retry, cancellation and online-wait are Effect combinators, which read well and are easy to extend (timeouts, racing, tracing). One factory API: `queryOptions` takes Effects and Schedules. Every app pays the Effect runtime and whatever the engine reaches.
- **Promise engine:** about half of TanStack Query, and Effect costs only apps that import `/effect`. Hand-rolled retry and abort plumbing is more code to get right (abort races, `CancelledError` paths). Two ways to define an Effect query, and Schedule retries in `config.defaults` need an adapter.
