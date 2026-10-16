# waitFor resolves on a match, never on a failure (agent)

- `queryClient.waitFor(factory, input, predicate, { signal })` and `QueryCache.waitFor` start the query as `prefetch` does, subscribe through `Entry.changes` (so they count as a reader), and resolve with the first data `predicate` matches.
- A failed request doesn't reject: a refetch, `setData` or a live subscription can still match, and the callers that need this (an auth flow waiting for `me` to change) sit next to a live source. Stopping is the caller's choice: pass a `signal`. The promise then rejects with `signal.reason`, as `fetch` does (`TimeoutError` for `AbortSignal.timeout`). A signal that is already aborted rejects without starting the query.
- Lost: rejecting on the first failure (a live source's transient failure would end the wait early), and resolving with the whole `State` (callers want the data; `Query.getUnsafe` has the rest).
- Lives in `packages/core/src/cache.ts` (`firstMatch`), `packages/core/src/client.ts`, `www/content/starting-queries.md#waiting-for-a-change`.
