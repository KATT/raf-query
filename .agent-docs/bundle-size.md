# Bundle size

`pnpm bundle-size` (`tooling/bundle-size`, CI job "Bundle Size") bundles small entries that each import one slice of raf-query, and prints each one's gzip size and the opt-in features found in it. React is external. The run fails when a bundle holds an opt-in feature its entry doesn't import, lacks one it does, or when the base entry passes 5 kB gzip ([decisions/bundle-budget.md](./decisions/bundle-budget.md)).

Measured 2026-11-06 with `pnpm bundle-size` (`src/`; `--dist` agrees within 0.01 kB):

| Entry                                                                              |    gzip | Over React hooks | Opt-in features in the bundle                                                                                       |
| ---------------------------------------------------------------------------------- | ------: | ---------------: | ------------------------------------------------------------------------------------------------------------------- |
| Core only (`createQueryClient`, `load`, `invalidateOne`)                           | 3.26 kB |                — | none                                                                                                                |
| + React hooks (`useQuery`, `QueryClientProvider`): the base                        | 4.30 kB |                — | React hooks                                                                                                         |
| + hydration (`HydrationBoundary`)                                                  | 4.70 kB |   +0.40 kB (+9%) | React hooks, hydration                                                                                              |
| + `retry()`                                                                        | 4.61 kB |   +0.30 kB (+7%) | React hooks, `retry()`                                                                                              |
| + `polling()`                                                                      | 4.53 kB |   +0.22 kB (+5%) | React hooks, `polling()`                                                                                            |
| + `focusRefetch()`                                                                 | 4.46 kB |   +0.16 kB (+4%) | React hooks, `focusRefetch()`                                                                                       |
| + `reconnectRefetch()`                                                             | 4.43 kB |   +0.12 kB (+3%) | React hooks, `reconnectRefetch()`                                                                                   |
| + `groups()`, `group`, `tag`                                                       | 4.69 kB |   +0.38 kB (+9%) | React hooks, `groups()`                                                                                             |
| + a stream query                                                                   | 4.34 kB |   +0.03 kB (+1%) | React hooks                                                                                                         |
| + `QueryBoundary`                                                                  | 4.54 kB |   +0.24 kB (+5%) | React hooks, `QueryBoundary`                                                                                        |
| TanStack defaults (`retry()`, focus and reconnect refetch, `polling()`, hydration) | 5.35 kB |  +1.04 kB (+24%) | React hooks, hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`                              |
| Everything (`recommended()`, `timeout()`, groups, hydration, boundary)             | 6.01 kB |  +1.71 kB (+40%) | React hooks, hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`, `groups()`, `QueryBoundary` |

Every opt-in feature is absent from the bundles that don't import it (the run fails otherwise). Markers:

- **TanStack defaults.** The features TanStack Query runs without being asked (retries, refetch on focus and reconnect, `refetchInterval`, hydration) cost 1.04 kB gzip together, 24% over the base. Each alone: hydration 0.40, `retry()` 0.30, `polling()` 0.22, `focusRefetch()` 0.16, `reconnectRefetch()` 0.12 kB; they sum to 1.20 kB because they share the feature plumbing and stale-read helpers. Structural sharing, gc and refetching stale data on read are in the base.
- **Markers.** A feature counts as present when its module has code in the bundle (`core/hydration`, `core/groups`, `boundary/index`, `react/use-query`) or, for features sharing a module, when a string that survives minification is in the output: `"[object Response]"` (`retry()`), `"refetchInterval"` (`polling()`), `"visibilitychange"` (`focusRefetch()`), `"refetchOnReconnect"` (`reconnectRefetch()`).
- **Streams aren't opt-in.** Folding an async iterable into the data lives in the entry (`entry.ts`), so every bundle carries it; a stream query costs only its own options.
- **The base sits at 4.30 kB of 5 kB.** Anything added to the always-imported path (`createQueryClient`, `load`, `useQuery`, the entry) has to pay for itself or go behind a link, feature or subpath.

## What defeats tree-shaking

- **Anything reachable from the always-imported path.** Behaviors that every client runs can't be shaken, so retries, focus/reconnect, polling, hydration, groups and paging are opt-in: links, features, subpaths, or a `~run` function set only by `infiniteQueryOptions`.
- **`export * as X` in a library build.** Rolldown/tsdown compile it to an `__exportAll` getter object, which keeps every member in `dist/`. The packages export named members only. Check with `pnpm bundle-size --dist` after `pnpm build`.
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; use an export condition ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- Dynamic access (`X[key]`) and re-exported `export *` of a module with side effects keep everything.
