# Paging lives in core; React only reads it (agent)

- `packages/core/src/infinite/paging.ts` owns paging: `PageControls` (`PageState` plus `fetchNextPage()` / `fetchPreviousPage()`), and, in `@raf-query/core/internal`, `pageState(entry, state?)` and `fetchPage(entry, direction)`. `useInfiniteQuery`'s controls are core's `PageControls`: the hook splits them into stable actions and tracked fields, and no longer computes `hasNextPage` from `pageParamAfter` itself. `pageParamAfter` left `internal`.
- Verbs for scripts, tests and other bindings, on the same functions: `fetchNextPage(client, factory, input)`, `fetchPreviousPage(…)`, `hasNextPage(…)` and `hasPreviousPage(…)`. A fetch resolves when the request settles; an error stays in the query's state, as with the hook. Without a page at that end it does nothing.
- Why: paging was React's. Other bindings had to copy `useInfiniteQuery`'s logic from `@raf-query/core/internal`, and verbs added beside it would have been a second copy.
- Bundle: the module sits beside `infinite.ts` and imports it, so the `paging` marker appears exactly when an app pages (`useInfiniteQuery` or a verb).
- Lost: rejecting on error (the hook's controls don't either).
- Tests: `packages/core/src/infinite/infinite.test.ts` ("load pages with the verbs, outside React"), React's paging tests unchanged. Docs: `infinite-queries.md#outside-react`, `api-reference.md`; sample `infinite-queries.outside-react.ts`.
