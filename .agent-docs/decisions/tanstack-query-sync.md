# TanStack Query sync ships on #231 (agent)

- Two-way cache sync ships on stacked pull request [#231](https://github.com/KATT/raf-query/pull/231) (`cursor/tanstack-query-sync-d7b8`). It is not in [#230](https://github.com/KATT/raf-query/pull/230)'s runtime: this branch has no `tanstackQuerySync` and no `@raf-query/*/tanstack-query` subpath.
- Gaps on #231: `where` targets over `meta` and factory invalidation only reach entries raf has read; a raf entry still loading its first data has no TanStack copy; a TanStack key whose first segment is not a string cannot come from a group.
- Whether #231 merges into #230 is open ([open-questions.md](../open-questions.md)).
