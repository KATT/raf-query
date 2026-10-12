# Bundle size: engine on Effect vs on Promises

Reference for when bundle size matters more. Measure with `pnpm bundle-size` (see `decisions.md`, "Bundle size").

## Current: engine on Effect (human picked, 2026-10-12)

The engine runs every request through `Effect.runPromiseExit` (`query.ts`: `Effect.gen`, `Effect.retry(schedule)`, interruption; `online.ts`: `Effect.callback`). `queryOptions` takes an Effect `queryFn` and a `Schedule` `retry` natively. The Effect-only client verbs (`ensureEffect`, `fetchEffect`, `invalidateEffect`, `watch`) live in `@raf-query/core/effect` / `@raf-query/react/effect`, so `Stream` / `Queue` stay out of apps that don't import them.

## Alternative: engine on Promises + `AbortSignal`

Built and working on branch **`cursor/promise-engine-reference-16c7`** (commit `45a59b9a`, plus measurement tooling in `d2697e01`). Main entries import only `Predicate`; `@raf-query/core/effect` adds `effectQueryOptions` / `effectInfiniteQueryOptions` (run an Effect `queryFn` with `runPromiseExit`, `CancelledError` on interrupt) and `retrySchedule(schedule)` → `RetryStrategy` (`{ start(): (failureCount, error) => delayMs | false }`, stepping the schedule with `Schedule.toStep` + `runSyncExit`). To revive: cherry-pick `45a59b9a`'s `query.ts`, `online.ts`, `options.ts`, `effect.ts` and the tests.

## Numbers (gzip, `tooling/bundle-size` fixtures, Start example's bundler)

| App                             | TanStack Query | Effect engine (now) | Promise engine |
| ------------------------------- | -------------: | ------------------: | -------------: |
| Factory + prefetch + `useQuery` |           9.77 |               16.75 |           5.64 |
| + paged                         |          10.44 |               17.15 |           6.04 |
| + action that invalidates       |          10.60 |               17.32 |           6.21 |
| TanStack Router app             |          12.36 |               18.50 |           7.41 |
| Effect `queryFn` + `Schedule`   |              — |               16.93 |          15.33 |

Effect's share of raf-query: ~11.2 kB (Effect engine) vs ~0.2 kB (Promise engine). The original layout (Effect engine plus `qc.effect` built in the constructor) was 19.11 kB / 13.4 kB share. Full `examples/tanstack-start` client JS: 168.9 kB (Effect engine), 157.7 kB (Promise engine), 171.3 kB (original).

## Trade-offs

Effect engine:

- Pro: retry, cancellation, online-wait are Effect combinators; reads well and is easy to extend (timeouts, racing, tracing).
- Pro: one factory API; `queryOptions` takes Effects and Schedules, no `effectQueryOptions` / `retrySchedule` adapter.
- Con: every app pays ~11 kB gzip of Effect, even without Effect code; ~1.7× TanStack Query for the simplest app.
- Floor: Effect's fiber runtime alone (`runPromiseExit(succeed(1))`) is ~7 kB gzip, so trimming engine imports (e.g. avoiding `Schedule` machinery when `retry` isn't a Schedule) could save at most ~4 kB. Effect v4 has no lighter `Micro` runtime.

Promise engine:

- Pro: ~half of TanStack Query; Effect costs only apps that import `/effect`.
- Con: hand-rolled retry loop, abortable `sleep` / `whenOnline`, and a `RetryStrategy` protocol to bridge Schedules; more code to get right (abort races, `CancelledError` paths).
- Con: two ways to define an Effect query (`effectQueryOptions` vs `queryOptions`), and Schedule retries in `config.defaults` need `retrySchedule(...)`.
