# raf-query on TanStack Start

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/queries.ts)

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same app on Next.js App Router, so the two integrations can be compared side by side.

| Screen / action                               | Shows                                                                                       | Files                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Issue list: status filter and sort in the URL | `validateSearch` → loader → `prefetch`, infinite scroll, `whilePending: "previous"` dimming | `src/routes/issues.index.tsx`, `src/components/issue-list.tsx` |
| Issue detail                                  | Blocking `ensure` in the loader, keyed Suspense skeleton when switching issues              | `src/routes/issues.$issueId.tsx`                               |
| Comments                                      | Paged query with infinite scroll, streamed `prefetch`                                       | `src/components/comments.tsx`                                  |
| Assignee card                                 | `useWaterfall`: a query that waits on the issue for its input                               | `src/components/user.tsx`                                      |
| Edit title, add comment                       | Form actions, `useOptimistic`, `await qc.invalidate`                                        | `src/components/edit-title.tsx`, `src/components/comments.tsx` |

Query factories are in `src/queries.ts`, and their `queryFn`s call the `createServerFn`s in `src/server-functions.ts`. `src/router.tsx` wires the query client into the router with `setupRouterIntegration`. The data comes from an in-memory fake database that waits `DB_LATENCY_MS` (default 400) ± 50% per call and resets when the server restarts.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:start
```

Then open <http://localhost:3000>.
