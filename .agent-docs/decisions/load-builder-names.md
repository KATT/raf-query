# The `load` entry builders are named after HTTP `Cache-Control` (human)

- `prefetch(factory, input)` starts the query if it isn't fresh and doesn't wait. `swr` is `stale-while-revalidate`: it waits only when nothing is cached, and stale data resolves at once and refetches in the background. `revalidate` is `must-revalidate`: it waits unless the cached data is fresh (`staleTime` is the max-age); on a server client data counts as fresh until a write invalidates it ([server-verbs-no-revalidate.md](./server-verbs-no-revalidate.md)). Fresh data is never refetched by any of them.
- The entry `kind` (`LoadEntry`, `LoadRecord`, the devtools' Loads list) is `"prefetch" | "swr" | "revalidate"`, and the options type is `LoadEntryOptions`. The example apps' verbs and routes use the same names (`/prefetch/…`, `/swr/…`, `/revalidate/…`; [loader-verb-url.md](./loader-verb-url.md)), and so does the docs demo's variants.
- Doc comments and `www/content/starting-queries.md` say what `swr` and `revalidate` do in plain words and name the directive once, linked to MDN's `Cache-Control` page. `comparison.md` maps them to TanStack's `prefetchQuery` / `ensureQueryData` / `fetchQuery`.
- Lost: `prefetchEntry` / `ensureEntry` / `fetchEntry` ("entry" is also the cache entry everywhere in core: `entry.ts`, `EntryState`, the internal `fetchEntry`); bare `prefetch` / `ensure` / `fetch` (`fetch` shadows the global).
- Internals: `fetchEntry` (`entry.ts`) runs an entry's request; `startIfStale` (`load.ts`) is what `prefetch` and `swr`'s background refetch call.
- Where: `packages/core/src/load.ts`.
