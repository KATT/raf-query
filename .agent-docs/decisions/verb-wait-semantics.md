# What each load entry waits for

- **Three distinct entries, matching TanStack Query** (human-picked, 2026-10-13). `prefetch` never waits (`prefetchQuery`, not awaited). `swr` waits on a cache miss only; stale data resolves at once and revalidates in the background (`ensureQueryData({ revalidateIfStale: true })`). `revalidate` also waits on stale data (`fetchQuery`).
- One rule decides "stale" for both the background refetch and `revalidate`'s wait: `isStale` (`entry.ts`), past `staleTime` or invalidated. On a server client `staleTime` doesn't apply: the background refetch never runs, and `revalidate` refetches only invalidated data (see [server-verbs-no-revalidate.md](./server-verbs-no-revalidate.md)), so a query read by several entries in one request is one request.
- The table at the top of `www/content/starting-queries.md` is the summary of the differences; keep it in sync.
