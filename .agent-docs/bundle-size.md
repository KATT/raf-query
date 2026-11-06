# Bundle size

`pnpm bundle-size` (`tooling/bundle-size`, CI job "Bundle Size") bundles small entries that each import one slice of raf-query, and prints each one's gzip size and the opt-in features found in it. React is external. The run fails when a bundle holds an opt-in feature its entry doesn't import, lacks one it does, or when the base entry passes 5 kB gzip ([decisions/bundle-budget.md](./decisions/bundle-budget.md)).

Measured 2026-11-06 (`src/` and `--dist` agree within 0.01 kB):

| Entry                                                                  |    gzip | Over React hooks | Opt-in features in the bundle                       |
| ---------------------------------------------------------------------- | ------: | ---------------: | --------------------------------------------------- |
| Core only (`createQueryClient`, `load`, `invalidateOne`)               | 3.24 kB |                — | none                                                |
| + React hooks (`useQuery`, `QueryClientProvider`): base                | 4.24 kB |                — | React hooks                                         |
| + hydration (`HydrationBoundary`)                                      | 4.64 kB |         +0.39 kB | React hooks, hydration                              |
| + `retry()`                                                            | 4.54 kB |         +0.30 kB | React hooks, `retry()`                              |
| + `polling()`                                                          | 4.47 kB |         +0.22 kB | React hooks, `polling()`                            |
| + `focusRefetch()`, `reconnectRefetch()`                               | 4.43 kB |         +0.19 kB | React hooks, `focusRefetch()`, `reconnectRefetch()` |
| + `groups()`, `group`, `tag`                                           | 4.63 kB |         +0.38 kB | React hooks, `groups()`                             |
| + a stream query                                                       | 4.28 kB |         +0.04 kB | React hooks                                         |
| + `QueryBoundary`                                                      | 4.47 kB |         +0.23 kB | React hooks, `QueryBoundary`                        |
| Everything (`recommended()`, `timeout()`, groups, hydration, boundary) | 5.94 kB |         +1.70 kB | all of the above                                    |

- **Markers.** A feature counts as present when its module has code in the bundle (`core/hydration`, `core/groups`, `boundary/index`, `react/use-query`) or, for features sharing a module, when a string that survives minification is in the output: `"[object Response]"` (`retry()`), `"refetchInterval"` (`polling()`), `"visibilitychange"` (`focusRefetch()`), `"refetchOnReconnect"` (`reconnectRefetch()`).
- **Streams aren't opt-in.** Folding an async iterable into the data lives in the entry (`entry.ts`), so every bundle carries it; a stream query costs only its own options.
- **The base sits at 4.24 kB of 5 kB.** Anything added to the always-imported path (`createQueryClient`, `load`, `useQuery`, the entry) has to pay for itself or go behind a link, feature or subpath.

## What defeats tree-shaking

- **Anything reachable from the always-imported path.** Behaviors that every client runs can't be shaken, so retries, focus/reconnect, polling, hydration, groups and paging are opt-in: links, features, subpaths, or a `~run` function set only by `infiniteQueryOptions`.
- **`export * as X` in a library build.** Rolldown/tsdown compile it to an `__exportAll` getter object, which keeps every member in `dist/`. The packages export named members only. Check with `pnpm bundle-size --dist` after `pnpm build`.
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; use an export condition ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- Dynamic access (`X[key]`) and re-exported `export *` of a module with side effects keep everything.
