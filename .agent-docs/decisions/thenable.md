# `Thenable` type (human asked)

- `Thenable<T>` (core, public type) = `Promise<T>` & a `status` union (`pending` / `fulfilled` + `value` / `rejected` + `reason`), the fields React's `use()` reads. `Query.State.promise` and `useQuery`'s promise are typed with it.
- Library code that already ensured a query returns or reads its thenable instead of re-checking `data !== undefined` (`QueryCache.fetch` succeeds with the cached data on a hit, the first fetch on a miss). No `unwrap()` helper (human).
- Apps, examples and README read with React's `use()` (human).
