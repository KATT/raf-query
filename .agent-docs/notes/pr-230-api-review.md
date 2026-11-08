# PR #230 API and DX review (in progress)

The human reviewed the public API and DX of #230 one point at a time with an agent (2026-11-08), then left the agent to finish on its own. Delete this file once every point below is either merged or written down as a decision, and the stacked PR is open.

How the human wants it: one point at a time, shown in code, short, plain words, bullets. Fixes go to subagents so the review keeps moving. Each decision also has its own file in `../decisions/`.

## Decided and done (commits on `cursor/greenfield-rewrite-0833`)

| Point                                          | Outcome                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `group()` required, in a subpath               | `group` on the main entry, hand-written keys allowed                                                            |
| `def: defType<…>()` in every factory           | Per-client typed `meta` kept; `bindQueryOptions` / `bindInfiniteQueryOptions` / `bindUseQueryClient`, zero cost |
| `action()`                                     | Removed for now ([no-action-helper.md](../decisions/no-action-helper.md))                                       |
| Several targets in one call                    | `invalidateMany` / `resetMany` / `removeMany` take lists, refetch each entry once                               |
| `prefetchEntry` / `ensureEntry` / `fetchEntry` | `prefetch` / `swr` / `revalidate` (HTTP `Cache-Control` words); example routes renamed                          |
| `setData(qc, f, undefined, …)`                 | Overload without input                                                                                          |
| Partial input matched the key's last segment   | Matches `entry.input`                                                                                           |
| Invalidate one page of an infinite query       | No: patch with `setData` (RQ removed `refetchPage` too). No `mapItems` helper                                   |
| `QueryProvider` vs `QueryClientProvider`       | One provider; every app writes the same `Providers` component                                                   |
| Server render behavior                         | Clients fed by server components skip unstarted queries; Start streams; React Router fetches twice              |
| Subpaths                                       | One entry point per package; only `/tanstack-router` (and core `/internal`) remain                              |
| `@raf-query/boundary`                          | Stays a separate package                                                                                        |
| Quick start                                    | tRPC's blog shape: post (`swr`), comments (`prefetch`, real paging), add comment; author for waterfalls         |
| `QueryControls`                                | `QueryState` / `InfiniteQueryState`; variables stay `xState`                                                    |
| `waterfallHandle` remix                        | Third argument is `(input) => next`; returns the same handle when the key doesn't change                        |
| `load()` tuple                                 | Kept. Maybe pull the data read into its own function later                                                      |
| Extension-only types                           | Moved to `/internal`; public: `link`, `feature`, `Link`, `Feature`, `Operation`, `Target`, `QueryInfo`          |
| Reads never refetch stale data on mount        | First item in Important defaults; no opt-in                                                                     |
| `useQuery(factory, handle)`                    | Kept; one sentence in the docs explains why                                                                     |
| Tags                                           | Userland recipe on `feature` + `where` (in progress)                                                            |
| One folder per behavior, tests as author docs  | In progress                                                                                                     |

## Still to do

- Typed errors (`fail()`, `Result`, `{ result: true }`, `ErrorOf`) and `@raf-query/boundary` leave #230 and come back in a PR stacked on it. Its follow-ups: errors declared once (`failure("IssueNotFound")<{ id }>()`), `QueryBoundary errors={[…]}` typing handlers from every listed query, `retry` refetching every failed query with a handled tag, and maybe `createErrorBoundary` like raf-effect-atom.
- Rewrite #230's description (it still describes `action()`, `prefetchEntry`, `QueryProvider`, subpaths, group-only keys, typed errors).

## Questions for the human

- A React Router integration that streams render-started queries, so they don't run twice.
- Disabled queries on a Start or React Router server reject (Start logs it; React Router's default entry may answer 500 before the shell). The docs' notification-permission sample relies on a disabled-on-server query.
- Fake-paged lists in the demos became plain `queryOptions` lists, which reverses #140's "every plural query is infinite".
