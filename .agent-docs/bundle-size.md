# Bundle size

`pnpm bundle-size` (`tooling/bundle-size`, CI job "Bundle Size") bundles small entries that each import one slice of raf-query, and prints each one's gzip size and the opt-in features found in it. React is external. The run fails when a bundle holds an opt-in feature its entry doesn't import, lacks one it does, or when the base entry passes 5 kB gzip ([decisions/bundle-budget.md](./decisions/bundle-budget.md)).

Measured 2026-11-06 with `pnpm bundle-size` (`src/`; `--dist` agrees within 0.01 kB):

| Entry                                                                              |    gzip | Over React hooks | Opt-in features in the bundle                                                                                 |
| ---------------------------------------------------------------------------------- | ------: | ---------------: | ------------------------------------------------------------------------------------------------------------- |
| Core only (`createQueryClient`, `load`, `invalidateOne`, `group`)                  | 3.26 kB |                — | none                                                                                                          |
| + React hooks (`useQuery`, `QueryClientProvider`): the base                        | 4.33 kB |                — | React hooks                                                                                                   |
| + hydration (`HydrationBoundary`)                                                  | 4.73 kB |   +0.40 kB (+9%) | React hooks, hydration                                                                                        |
| + `retry()`                                                                        | 4.64 kB |   +0.31 kB (+7%) | React hooks, `retry()`                                                                                        |
| + `polling()`                                                                      | 4.56 kB |   +0.23 kB (+5%) | React hooks, `polling()`                                                                                      |
| + `focusRefetch()`                                                                 | 4.49 kB |   +0.16 kB (+4%) | React hooks, `focusRefetch()`                                                                                 |
| + `reconnectRefetch()`                                                             | 4.45 kB |   +0.12 kB (+3%) | React hooks, `reconnectRefetch()`                                                                             |
| + tags (`groups()`, `tag`)                                                         | 4.69 kB |   +0.36 kB (+8%) | React hooks, tags                                                                                             |
| + a stream query                                                                   | 4.36 kB |   +0.03 kB (+1%) | React hooks                                                                                                   |
| + `QueryBoundary`                                                                  | 4.57 kB |   +0.24 kB (+5%) | React hooks, `QueryBoundary`                                                                                  |
| TanStack defaults (`retry()`, focus and reconnect refetch, `polling()`, hydration) | 5.39 kB |  +1.06 kB (+24%) | React hooks, hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`                        |
| Everything (`recommended()`, `timeout()`, tags, hydration, boundary)               | 6.16 kB |  +1.83 kB (+42%) | React hooks, hydration, `retry()`, `polling()`, `focusRefetch()`, `reconnectRefetch()`, tags, `QueryBoundary` |

Every opt-in feature is absent from the bundles that don't import it (the run fails otherwise). Markers:

- **TanStack defaults.** The features TanStack Query runs without being asked (retries, refetch on focus and reconnect, `refetchInterval`, hydration) cost 1.06 kB gzip together, 24% over the base. Each alone: hydration 0.40, `retry()` 0.31, `polling()` 0.23, `focusRefetch()` 0.16, `reconnectRefetch()` 0.12 kB; they sum to 1.22 kB because they share the feature plumbing and stale-read helpers. Structural sharing, gc and refetching stale data on read are in the base.
- **Markers.** A feature counts as present when its module has code in the bundle (`core/hydration`, `boundary/index`, `react/use-query`) or, for features sharing a module, when a string that survives minification is in the output: `"[object Response]"` (`retry()`), `"refetchInterval"` (`polling()`), `"visibilitychange"` (`focusRefetch()`), `"refetchOnReconnect"` (`reconnectRefetch()`), `".tags"` (tags, which share `core/groups` with `group()`).
- **Streams aren't opt-in.** Folding an async iterable into the data lives in the entry (`entry.ts`), so every bundle carries it; a stream query costs only its own options.
- **Groups are in the base.** Every key comes from `group()`, so every bundle carries it: 152 B gzip on its own in production (esbuild, `NODE_ENV=production`), 62 B next to core, which shares its helpers. Its development check that a subgroup and a query don't share a name is behind `process.env.NODE_ENV !== "production"` and costs 0 B in production. Matching a group as a key prefix keeps core 48 B under matching object groups.
- **The base sits at 4.33 kB of 5 kB.** Anything added to the always-imported path (`createQueryClient`, `load`, `useQuery`, the entry) has to pay for itself or go behind a link, feature or subpath.

## What defeats tree-shaking

- **Anything reachable from the always-imported path.** Behaviors that every client runs can't be shaken, so retries, focus/reconnect, polling, hydration, tags and paging are opt-in: links, features, subpaths, or a `~run` function set only by `infiniteQueryOptions`.
- **`export * as X` in a library build.** Rolldown/tsdown compile it to an `__exportAll` getter object, which keeps every member in `dist/`. The packages export named members only. Check with `pnpm bundle-size --dist` after `pnpm build`.
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; use an export condition ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- Dynamic access (`X[key]`) and re-exported `export *` of a module with side effects keep everything.
