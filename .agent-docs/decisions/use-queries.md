# `useQueries` reads a list of handles (agent)

- `useQueries(factory, handles, options?)` returns `[promise, controls[]]`: one promise of every query's data in handle order, and each query's controls. It only reads; the loader still starts every query (human asked to showcase `useQueries` and add it if raf-query couldn't do it). A component per handle calling `useQuery` stays the first answer when rows render on their own.
- The promise is `Promise.all` of the observers' promises, memoized by those promises' identities (`allOf` in `use-queries.ts`) and pre-settled when they are, so `use()` doesn't suspend on updates. In `Result` mode each part is the `resultThenable`, so it never rejects.
- Always a promise, also for `QueryHandleWithData` lists: an empty list can't tell the two overloads apart at runtime, so `useQuery`'s "data for a handle with data" rule can't hold. A list of handles with data is fulfilled already, so `use()` returns at once.
- One factory per call. A fixed list of different factories is several `useQuery` calls; TanStack's heterogeneous `queries: [...]` array lost.
- No `combine`: derive after `use()`. Lost: TanStack's `combine`, which exists to memoize a derived result across renders; the stable promise already gives that.
- Observers follow their query by hash when the list reorders; leftovers are reused in order, so `whilePending: "previous"` works per position (TanStack's `QueriesObserver` matches the same way).
- Tests: `packages/react/src/use-queries.test.tsx`. Docs: `www/content/reading-queries.md#reading-a-list-of-handles`.
