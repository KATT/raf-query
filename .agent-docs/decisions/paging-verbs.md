# Paging verbs outside React (agent)

- `fetchNextPage(client, factory, input)` and `fetchPreviousPage(…)` are verbs (`verbs.ts`), typed for `InfiniteQueryFactory`. They run the same directional request as `useInfiniteQuery`'s controls (`fetchEntry(entry, { direction })`) and resolve when it settles; an error stays in the query's state, as with the hook. Without a page at that end they do nothing.
- Why: scripts, tests and bindings to other frameworks had no public way to page. Integrations paged in their tests through `@raf-query/core/internal` (`entryOf`, `fetchEntry`).
- They import no paging code (the paging lives in the factory's `~run`), so the `paging` bundle marker stays out of apps that don't import them.
- Lost: `hasNextPage` / `hasPreviousPage` verbs (a fetch at an end with no page already does nothing, and `getData` plus the factory's page param functions answer it), and rejecting on error (the hook's controls don't).
- Tests: `packages/core/src/infinite/infinite.test.ts` ("load pages with the verbs, outside React"). Docs: `infinite-queries.md#outside-react`, `api-reference.md`; sample `infinite-queries.outside-react.ts`.
