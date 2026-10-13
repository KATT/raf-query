# Promise engine, Effect behind `/effect` (human asked)

Human: minimise the bundle, keep the Effect integration in its own entry ("cut effect except in that entrypoint"), then "do the promise engine here". An earlier Promise rewrite was rejected for its internals ("shit tier code"), so this one keeps the engine small and plain and leaves the complex parts to Effect on the `/effect` side.

- **`@raf-query/core` and `@raf-query/react` have no runtime `effect` import.** Effect appears only as `import type` (option types accept Effects and Schedules). The Effect API is `@raf-query/core/effect`, re-exported as `@raf-query/react/effect`. The simplest fixture app is 6.77 kB gzip (TanStack Query: 9.77). Numbers: [bundle-size.md](../bundle-size.md).
- **A request result is an `Outcome`** (`outcome.ts`): `{ kind: "success" | "failure" | "defect" | "cancelled" }`. Typed failures and defects stay apart, so `/effect` maps them back to `fail` / `die` (`awaitOutcome`). It uses `kind` because the lint rules reserve `_tag` for Effect's constructors.
- **Cancellation is its own outcome kind, not an error class** (human: "CancelledError could use a default AbortError"). The Promise API rejects with `new DOMException(…, "AbortError")`, like an aborted `fetch`; `/effect` fails with `Query.CancelledError` (a `Data.TaggedError`, so `catchTag` works) and maps interrupts to `cancelled()`. The engine checks the kind, never the error's name: a `queryFn` that throws its own `AbortError` stays an ordinary failure, or a first load would never settle.
- **`RedactedError` stays a class** (`hydration.ts`): it replaces a failed query's error when the server streams it to the browser, so server errors don't leak into the page, and tests and apps tell it apart with `instanceof`.
- **Requests and timers** (`entry.ts`):
  - Each request gets its own `AbortController`. A restart aborts the previous one, and a settle is ignored unless `entry.request` is still the request that produced it.
  - `entry.inFlight` (`Promise.withResolvers`) outlives restarts, so callers awaiting an `invalidate` keep waiting.
  - Retries are an `async` loop with abortable `sleep(clock, ms, signal)` and `whenOnline(platform, signal)`. Both resolve when aborted, and the loop checks the signal after each wait.
  - `gc`, `stale` and polling timers go through the injected `Clock` (`clock.ts`). Each timer returns a cancel function, stored in `entry.timers`. `errorShown` uses a real `setTimeout(0)` because it marks a macrotask, not elapsed time.
  - `entry.onRemove` holds the finalizers a removed entry runs, such as observers stopping their polling.
- **Effect `queryFn`s run through `EffectServices`** (`request.ts`): `{ context, run(effect, context, signal): Promise<Outcome>, dispose }`. They're made by `fromContext(context)` or `fromLayer(layer)` from `/effect` and passed as `QueryClient`'s `services`. Effects are detected with the `"~effect/Effect"` property, without importing Effect. An Effect `queryFn` on a client without services fails with a defect whose message names `fromLayer` / `fromContext`. A synchronous throw or a defect is not retried and is logged with `console.error("raf-query: queryFn died", …)`.
- **Retries:** counts and predicates run in the loop. A `RetryStrategy` (`retry.ts`: `start(now) => (failureCount, error) => delay | undefined`) is the hook for anything richer. `retrySchedule(schedule)` (`/effect`) drives a `Schedule` with `Schedule.toStep` + `runSyncExit`, so Schedule's driver ships only with it.
- **The `/effect` side is where Effect does the work** (`effect/cache.ts`):
  - `make` builds the Promise cache with a `Clock` that forks `Effect.sleep` fibers, so `TestClock` drives the core tests. It also gives the cache the `Platform` reference and `fromContext` of its own context, and disposes the cache when its `Scope` closes.
  - `fromCache(cache)` wraps an existing cache, such as React's `qc.cache`.
  - Callers' contexts merge into a request's services (`provideCaller`, caller wins, `Scope` omitted).
  - `events` / `watch` / `changes` are Streams, and `dehydrateStream` wraps core's `ReadableStream` in `acquireRelease`.
- **Lost:**
  - the Effect-native engine (one fiber per task, `Deferred` results, `Effect.retry`). It read better and made timeouts, racing and tracing one-liners, but put the Effect runtime (~10–12 kB gzip) into every app.
  - `wrapRequest` / `traceRequest`: an Effect `queryFn` can call `withSpan` itself.
  - `qc.effect` (now `QueryCache.fromCache(qc.cache)`), `ServicesBuilder`, and `Pipeable` on `Query` / `QueryObserver`.
