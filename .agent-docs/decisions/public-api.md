# Public API shape (human picked)

Spec lives in the docs site's pages (`www/content`). Picks, and what lost:

- **Read API: `[xThenable, xState] = useQuery(factory, handle)`**: a `Thenable` for every handle, read with `const x = use(xThenable)` (see [use-query-thenable.md](./use-query-thenable.md)). Lost: suspense-direct `{ data } = useQuery(...)` (hides `use()`, can't pass promises down; could be sugar later), registry-based `useQuery(handle)` (every definition in the root bundle, global name uniqueness).
- **Definitions: TanStack-style factories `(input?) => queryOptions({ queryKey, queryFn })`.** Lost: `defineQuery({ name, fn })` with derived keys. Consequence: invalidation is by factory (with all or part of its input), by group, or by a target (see [keys-groups-tags.md](./keys-groups-tags.md)).
- **Hydration: cache-level stream; handles carry no promises.** Lost: handle-carried promises. Consequence: every framework needs an integration (`/tanstack-router`, `HydrationBoundary`). Handles carry no data either: readers go through the cache.
- **Engine: own core**, copying mechanisms from TanStack — not a wrapper around `@tanstack/query-core`. See [implementation-notes.md](../implementation-notes.md).
- **Paged vs plain is decided only by the factory** (`infiniteQueryOptions` vs `queryOptions`). One `useQuery`, one set of verbs; no `useInfiniteQuery` / `prefetchInfinite` / etc. Paging controls exist only on paged factories' types.
- **Loading:** `load(client, { … })` with `prefetchEntry`, `ensureEntry` and `fetchEntry` (`ensureEntry` doesn't wait on stale data). `waterfallHandle` is the only deliberate render-time starter.
- **Mutations:** no `useMutation`; Actions wrapped in `action()` (with the `invalidateOnAction()` feature) or the invalidate verbs and `setData`, React's `useOptimistic` for optimistic UI.
- **URL drives input.** No read-site input override (`useQuery(..., { input })`); don't put `useState`-derived query input in docs examples. Search params → `loaderDeps` → `load`.
- **Pending-input behavior is `whilePending: "suspend" | "previous"`**, with `isPrevious` in controls, instead of TanStack's `placeholderData: keepPreviousData` + `isPlaceholderData`. `"suspend"` relies on both routers committing navigations in `startTransition` (TanStack Router: `link.ts` "All navigations now use startTransition under the hood"; `Transitioner.tsx`). Skeleton-on-change is a keyed Suspense (`key={state.hash}`), not a third mode — a hook can't force an already-revealed boundary back to its fallback inside a transition.
- **No refetch on mount.** Loaders, invalidation, `refetch()` and the opt-in features (focus and reconnect refetch while stale, polling through `meta.refetchInterval`) are the only refetch triggers.
- **Server-only factories** (importing DB code) can't be read by client hooks; pass a plain promise prop or render in RSC. (A `server: true` flag can't help: the client component would still have to import the factory.)
