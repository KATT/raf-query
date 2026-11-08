# PR #230 API and DX review (in progress)

The human is reviewing the public API and DX of #230 one point at a time, with an agent. Delete this file when the review is done and every point is either fixed or recorded as a decision.

How the human wants it: one point at a time, shown in code, short, plain words, bullets. Fixes go to subagents so the review keeps moving.

| #   | Point                                                                               | Status                                                                                      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Quick start's first query is a fake infinite query (`nextCursor: null`)             | Proposed: quick start reads one item. Not decided, not done                                 |
| 2   | `useQuery(factory, handle)` names the factory twice                                 | Proposed: keep it, explain why in the docs (handles are data, can't carry `queryFn`)        |
| 3   | `group()` required but in a subpath; keys must come from a group                    | Done (`f198347035`): `group` in the main entry, hand-written keys allowed                   |
| 4   | `def: defType<…>()` in every factory for typed `meta`                               | Human wants per-client `meta`. Agent building one binder per builder, no bundle cost        |
| 5   | `action()`                                                                          | Human: remove for now, may return ([no-action-helper.md](../decisions/no-action-helper.md)) |
| 5b  | `invalidateMany` should take many targets in one call, so writes don't waterfall    | Agent building the array overload (also `resetMany`, `removeMany`)                          |
| 6   | "Entry" means both a `load` item (`prefetchEntry`) and a cache entry                | Not discussed yet. Proposal: `prefetch` / `ensure` / `fresh`                                |
| 7   | `setData` needs `undefined` for factories without input                             | Not discussed yet                                                                           |
| 8   | `QueryProvider` vs `QueryClientProvider`: names don't say which is the RSC one      | Not discussed yet                                                                           |
| 9   | `@raf-query/react` re-exports extension-author types (`link`, `feature`, `Decl`, …) | Not discussed yet. Proposal: an `/extend` subpath                                           |
| 10  | Reading never refetches stale data on mount; make it loud in Important defaults     | Not discussed yet                                                                           |
| 11  | `waterfallHandle` overloads do two jobs (build vs switch input)                     | Not discussed yet                                                                           |
| 12  | `load()` returns `[handles, data]`; most callers write `const [handles] = …`        | Not discussed yet (taste)                                                                   |
| 13  | `postState` vs `controls`                                                           | Proposal: rename the types to `QueryState` / `InfiniteQueryState`, keep `xState` names      |

Also discussed:

- Tags could be a third-party plugin: core only needs links/features that declare `meta`, and targets with `where`. Not decided.
- The human considered going React Query style (no root, built-in options) and kept the root for per-client typed `meta`.
- When pushing, fix the PR description: it still says `queryOptions` takes only group-built keys, and it describes `action()`.
