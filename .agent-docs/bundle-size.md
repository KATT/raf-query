# Bundle size

`pnpm bundle-size` (`tooling/bundle-size`, CI job "Bundle Size") bundles small entries that each import one slice of raf-query, and prints each one's gzip size and the opt-in features found in it. React is external. The run fails when a bundle holds an opt-in feature its entry doesn't import, lacks one it does, or when the base entry passes 5 kB gzip ([decisions/bundle-budget.md](./decisions/bundle-budget.md)).

Measured 2026-11-08 with `pnpm bundle-size` (`src/`; `--dist` agrees within 0.01 kB):

| Entry                                                                              |    gzip | Over React hooks | Opt-in features in the bundle                                                                                                              |
| ---------------------------------------------------------------------------------- | ------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Core only (`createQueryClient`, `load`, `invalidateOne`, `group`)                  | 3.25 kB |                — | none                                                                                                                                       |
| + React hooks (`useQuery`, `QueryClientProvider`): the base                        | 4.46 kB |                — | React hooks                                                                                                                                |
| + hydration (`HydrationBoundary`)                                                  | 4.87 kB |   +0.41 kB (+9%) | React hooks, hydration                                                                                                                     |
| + `retry()`                                                                        | 4.75 kB |   +0.29 kB (+7%) | React hooks, `retry()`                                                                                                                     |
| + `polling()`                                                                      | 4.68 kB |   +0.22 kB (+5%) | React hooks, `polling()`                                                                                                                   |
| + `focusRefetch()`                                                                 | 4.61 kB |   +0.15 kB (+3%) | React hooks, `focusRefetch()`                                                                                                              |
| + `reconnectRefetch()`                                                             | 4.58 kB |   +0.12 kB (+3%) | React hooks, `reconnectRefetch()`                                                                                                          |
| + tags (`groups()`, `tag`)                                                         | 4.81 kB |   +0.35 kB (+8%) | React hooks, tags                                                                                                                          |
| + a paged query (`useInfiniteQuery`)                                               | 5.12 kB |  +0.66 kB (+15%) | React hooks, paging (`useInfiniteQuery`)                                                                                                   |
| + a stream query                                                                   | 4.50 kB |   +0.04 kB (+1%) | React hooks                                                                                                                                |
| + `QueryBoundary`                                                                  | 4.70 kB |   +0.23 kB (+5%) | React hooks, `QueryBoundary`                                                                                                               |
| TanStack defaults (`retry()`, focus and reconnect refetch, `polling()`, hydration) | 5.49 kB |  +1.03 kB (+23%) | React hooks, hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`                                                     |
| Everything (`recommended()`, `timeout()`, tags, hydration, paging, boundary)       | 6.93 kB |  +2.47 kB (+55%) | React hooks, hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`, tags, paging (`useInfiniteQuery`), `QueryBoundary` |

Every opt-in feature is absent from the bundles that don't import it (the run fails otherwise). Markers:

- **TanStack defaults.** The features TanStack Query runs without being asked (retries, refetch on focus and reconnect, `refetchInterval`, hydration) cost 1.03 kB gzip together, 23% over the base. Each alone: hydration 0.41, `retry()` 0.29, `polling()` 0.22, `focusRefetch()` 0.15, `reconnectRefetch()` 0.12 kB; they sum to 1.19 kB because they share the feature plumbing and stale-read helpers. Structural sharing, gc and refetching stale data on read are in the base.
- **Markers.** A feature counts as present when its module has code in the bundle (`core/hydration`, `core/infinite`, `boundary/index`, `react/use-query`) or, for features sharing a module, when a string that survives minification is in the output: `"[object Response]"` (`retry()`), `"refetchInterval"` (`polling()`), `"visibilitychange"` (`focusRefetch()`), `"refetchOnReconnect"` (`reconnectRefetch()`), `".tags"` (tags, which share `core/groups` with `group()`).
- **Streams aren't opt-in.** Folding an async iterable into the data lives in the entry (`entry.ts`), so every bundle carries it; a stream query costs only its own options.
- **Groups are in the base.** Every key comes from `group()`, so every bundle carries it: 152 B gzip on its own in production (esbuild, `NODE_ENV=production`), 62 B next to core, which shares its helpers. Its development check that a subgroup and a query don't share a name is behind `process.env.NODE_ENV !== "production"` and costs 0 B in production. Matching a group as a key prefix keeps core 48 B under matching object groups.
- **Paging is opt-in.** `useInfiniteQuery` is the only reader of `core/infinite` (page params, `pagesAround`), so `useQuery` apps don't ship it ([decisions/split-infinite-hook.md](./decisions/split-infinite-hook.md)). Splitting the hooks took the base from 4.30 to 4.15 kB.
- **Tracked state is in the base.** The read-field tracking both hooks share (`react/tracked`) costs 0.31 kB: the base went from 4.15 to 4.46 kB ([decisions/tracked-state.md](./decisions/tracked-state.md)).
- **The base sits at 4.46 kB of 5 kB.** Anything added to the always-imported path (`createQueryClient`, `load`, `useQuery`, the entry) has to pay for itself or go behind a link, feature or subpath.

## What defeats tree-shaking

- **Anything reachable from the always-imported path.** Behaviors that every client runs can't be shaken, so retries, focus/reconnect, polling, hydration, tags and paging are opt-in: links, features, subpaths, or a `~run` function set only by `infiniteQueryOptions`.
- **`export * as X` in a library build.** Rolldown/tsdown compile it to an `__exportAll` getter object, which keeps every member in `dist/`. The packages export named members only. Check with `pnpm bundle-size --dist` after `pnpm build`.
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; use an export condition ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- Dynamic access (`X[key]`) and re-exported `export *` of a module with side effects keep everything.
