# `useQuery` and `useInfiniteQuery` (human decided)

- Alex (2026-11-08): "separate useQuery and useInfiniteQuery". `useQuery(factory, handle, options?)` takes a `SingleQueryFactory` (no `getNextPageParam`) and returns `[thenable, QueryControls]`. `useInfiniteQuery` takes an `InfiniteQueryFactory` and returns `[thenable, InfiniteQueryControls]`, which adds `PageControls`. Both take `UseQueryOptions`.
- Why: one hook with a conditional state type shipped page params and page controls to every app, and its state type changed shape with the factory. With two hooks, `useQuery`'s import graph has no `core/infinite`: base bundle 4.30 → 4.15 kB, TanStack defaults 5.34 → 5.18 kB; a paged app costs the same (4.79 → 4.81 kB).
- Loader entries, handles, verbs and `infiniteQueryOptions` still take either kind; only reading splits. A generic `F extends QueryFactory` still passes to `useQuery` (its constraint has no `getNextPageParam`), so wrappers keep compiling.
- Shared code: `useQueryRead` in `use-query.ts` (not exported from the package). `use-infinite-query.ts` imports it, never the reverse.
- Tests: `hooks.test-d.tsx` (wrong kind is a type error for each hook), `use-infinite-query.test.tsx`, the compiler suite's paged test (data and `isFetchingNextPage` on every write), core's `readPages`.
- Bundle-size: the `paging` marker (`core/infinite`) fails the run if it reaches a bundle that doesn't import `useInfiniteQuery`.
