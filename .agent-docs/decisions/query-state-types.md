# The read hooks' second slot is typed `QueryState` (human)

- `useQuery` returns `[thenable, QueryState<F>]` and `useInfiniteQuery` returns `[thenable, InfiniteQueryState<F>]` (which adds `PageControls`). Variables keep the `xState` name (`postState`, `commentsState`; [use-query-thenable.md](./use-query-thenable.md)), so the type and the variable say the same thing. The docs call it the query's "state" (`www/content/reading-queries.md#state`).
- `@raf-query/react` has no other public type named `QueryState`; inside it, the entry's state is `EntryState` from `@raf-query/core/internal`.
- Lost: `QueryControls` / `InfiniteQueryControls`, and renaming the variables to `controls`.
- Files: `packages/react/src/use-query.ts`, `use-infinite-query.ts`, `index-shared.ts`, `hooks.test-d.tsx`, `www/content/api-reference.md`.
