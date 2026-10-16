# `useQueries` reads a list of handles (agent)

- `useQueries(factory, handles, options?)` returns one `useQuery` tuple per handle, in handle order: `[promise, controls]`, or `[data, controls]` for a handle with data, picked per handle at runtime as `useQuery` does. It only reads; the loader still starts every query (human asked to showcase `useQueries` and add it if raf-query couldn't do it). A component per handle calling `useQuery` stays the first answer when rows render on their own.
- Tuples, not one combined `Promise.all` promise (human asked for the `useQuery` shape). `use()` can run in a loop, so `reads.map(([p]) => use(p))` covers "all at once" without a combined thenable, a module-level cache to keep it stable, or a Proxy to track its status. The cost: the component suspends once per query still loading on a first render, instead of once for all of them; the requests run in parallel either way since loaders start them.
- `UseQueriesResult` maps over the handles' type, so a tuple of handles gives a tuple of results, each typed by its own handle (`QueryHandle` or `QueryHandleWithData`).
- `readerTuple` in `use-query.ts` builds each tuple for both hooks, so they track the promise and controls the same way.
- The `useSyncExternalStore` callbacks live in the component's state, next to the observers, and are made again when the observer list changes. No module-level `WeakMap`.
- One factory per call. A fixed list of different factories is several `useQuery` calls; TanStack's heterogeneous `queries: [...]` array lost.
- No `combine`: derive after `use()`. Lost: TanStack's `combine`, which exists to memoize a derived result across renders; each promise is already stable.
- Observers follow their query by hash when the list reorders; leftovers are reused in order, so `whilePending: "previous"` works per position (TanStack's `QueriesObserver` matches the same way).
- Tests: `packages/react/src/use-queries.test.tsx`. Docs: `www/content/reading-queries.md#reading-a-list-of-handles`.
