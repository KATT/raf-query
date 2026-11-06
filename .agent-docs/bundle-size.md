# Bundle size

`pnpm bundle-size` (`tooling/bundle-size`) bundles the same small apps with TanStack Query and raf-query and prints gzip (minified) sizes, then builds `examples/tanstack-start` and sums its client JS. The first app is raf-query's budget: the run fails if its client-only base passes 5 kB gzip ([decisions/bundle-budget.md](./decisions/bundle-budget.md)).

## Current: the promise kernel (greenfield rewrite)

Measured 2026-11-06, against the Effect-native engine on `main` at `a9f2aa77`, same apps and bundler:

| App                                                    | TanStack Query | raf-query | Effect-native engine |
| ------------------------------------------------------ | -------------: | --------: | -------------------: |
| Factory + prefetch + `useQuery` (client-only base)     |        9.77 kB |   4.97 kB |             30.33 kB |
| + paged query with Load more                           |       10.44 kB |   5.63 kB |             30.73 kB |
| + form action that invalidates                         |       10.60 kB |   5.95 kB |             30.89 kB |
| First app + server dehydrate and `HydrationBoundary`   |       10.60 kB |   5.71 kB |                    — |
| TanStack Router app (`recommended()`, loaders and SSR) |       12.36 kB |   7.41 kB |             31.48 kB |

- **Full `examples/tanstack-start` client JS:** 235.9 kB gzip, against 268.5 kB on `main`. Most of what's left is the app: React, TanStack Router, zod, Base UI, sonner and the devtools panel.
- **The base sits at the budget's edge** (4.97 kB of 5 kB). Anything added to the always-imported path (`createQueryClient`, `load`, `useQuery`, the entry) has to pay for itself or move behind a link, feature or subpath.

## What defeats tree-shaking

- **Anything reachable from the always-imported path.** Behaviors that every client runs can't be shaken, so retries, focus/reconnect, polling, hydration, groups and paging stay opt-in: links, features, subpaths, or a `~run` function set only by `infiniteQueryOptions`.
- **`export * as X` in a library build.** Rolldown/tsdown compile it to an `__exportAll` getter object, which keeps every member in `dist/`. The packages export named members only. Check with `pnpm bundle-size --dist` after `pnpm build`.
- **Runtime branches on build-time facts.** `if (router.isServer) setupServer()` keeps the server half's imports; use an export condition instead ([decisions/router-browser-build.md](./decisions/router-browser-build.md)).
- Dynamic access (`X[key]`) and re-exported `export *` of a module with side effects keep everything.
