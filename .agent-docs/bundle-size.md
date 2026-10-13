# Bundle size

Reference for when bundle size matters more. Measure with `pnpm bundle-size` (see [decisions/bundle-size-measurement.md](./decisions/bundle-size-measurement.md)).

## Current: Promise engine, Effect behind `/effect`

Core runs requests on Promises + `AbortSignal` and has no runtime `effect` import; the Effect API (`QueryCache` service, Streams, `retrySchedule`, `fromContext` / `fromLayer`) is `@raf-query/core/effect`, re-exported as `@raf-query/react/effect`. Apps that never import `/effect` bundle no Effect at all. Design: [decisions/promise-engine.md](./decisions/promise-engine.md); the rules that keep the Effect side shakable: [decisions/bundle-size-cuts.md](./decisions/bundle-size-cuts.md).

## Numbers (gzip, kB; `tooling/bundle-size` fixtures, Start example's bundler)

| App                                | TanStack Query | raf-query now | Effect-native engine, trimmed | Effect-native before the cuts |
| ---------------------------------- | -------------: | ------------: | ----------------------------: | ----------------------------: |
| Factory + prefetch + `useQuery`    |           9.77 |          6.77 |                         19.24 |                         29.26 |
| + paged                            |          10.44 |          7.17 |                         19.64 |                         29.65 |
| + action that invalidates          |          10.60 |          7.34 |                         19.80 |                         29.81 |
| TanStack Router app                |          12.36 |          8.10 |                         20.61 |                         31.44 |
| Effect `queryFn` + `retrySchedule` |              — |         17.15 |                         20.48 |                         29.49 |
| Effect `queryFn` + `fromLayer`     |              — |         16.74 |                         19.70 |                             — |

- `dist/` bundles the same as src for the default apps; the two Effect apps are ~0.1 kB bigger from `dist/` (17.23 / 16.81).
- **Effect's share of raf-query:** 0 kB in the default apps; ~10 kB in the Effect apps (its fiber runtime plus `Stream` / `Layer` / `Schedule` as used). It was ~12.0 kB in every app with the trimmed Effect-native engine.
- **Full `examples/tanstack-start` client JS:** 160.0 kB now, 173.5 kB with the trimmed Effect engine, 185.3 kB before the cuts. The TanStack-backed copy is 163.1 kB.
- **Floor for Effect users:** Effect's fiber runtime alone (`runPromiseExit(succeed(1))`) is ~7 kB gzip; with fork, gen, sleep, `Deferred` and `Scope` ~11.7 kB. Effect v4 has no lighter `Micro` runtime.

## Why it's big, and what's shakable

Effect v4 shakes per export (`sideEffects` lists only a schema file), and app-side `import { X }` / `import * as X` with static access both shake with Rolldown. What defeats it:

- **Anything reachable from the always-imported path.** Members of a service object (`QueryCache`'s methods), class properties built in a constructor, and engine code that runs on every request can't be shaken, whatever they import.
- **Top-level calls without `/*#__PURE__*/`** (`Context.Service(...)`, `Effect.fnUntraced(...)`, `Context.Reference(...)`).
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; even a constant-folded `isServer` left Queue/Stream residue after minification. Use export conditions (`browser`) for a separate module ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- **`export * as X` in a rolldown library build** (`vp pack` / tsdown): an `__exportAll` getter object keeps every member. Packages build with `tsc` for that reason.
- Dynamic access (`X[key]`) and re-exported `export *` keep everything.

## What's left

- The default apps are raf's own code. Largest modules in `queryApp` (unminified rendered bytes): `entry.ts` 12.0k, `observer.ts` 5.3k, `cache.ts` 5.1k, `use-query.ts` 2.3k, `infinite.ts` 2.3k. `infinite.ts` ships with plain queries because `fetch` branches on `kind` at runtime.
- Use `tooling/bundle-size/src/analyze.ts` to list modules by size.
- Measured for `queryApp`:
  - **Dropping classes:** done anyway, for simplicity (human asked): `createQueryClient` returns closures over `cache` (no `this.cache`, ~0.03 kB gzip), and cancellation rejects with a built-in `AbortError` instead of a `CancelledError` class. Only `RedactedError` is left, because callers need `instanceof`.
  - **Short internal property names:** minifiers keep property names. Renaming the ~20 internal-only `Entry` / cache fields (`inFlight`, `retriesStopped`, `failureCountBefore`, `onRemove`, …) to two characters saves ~970 B minified but only ~0.13 kB gzip, since gzip already dedupes repeats. Public `State` fields (`isFetching`, `hasData`, …) can't be renamed.
