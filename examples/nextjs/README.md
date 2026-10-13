# raf-query on Next.js App Router

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/KATT/raf-query/tree/stackblitz/examples/nextjs?file=apps/nextjs/src/queries.ts,apps/nextjs/src/app/issues/page.tsx)

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is the same app on TanStack Start, so the two integrations can be compared side by side.

| Screen / action                               | Shows                                                                                                  | Files                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL | Server component `prefetch`es from `searchParams`, infinite scroll, `whilePending: "previous"` dimming | `src/app/issues/page.tsx`, `src/components/issue-list.tsx`           |
| Issue detail                                  | `await qc.fetch` the issue, then `prefetch` its assignee                                               | `src/app/issues/[issueId]/page.tsx`, `src/components/issue-page.tsx` |
| Comments                                      | Paged query with infinite scroll, streamed through `HydrationBoundary`                                 | `src/components/comments.tsx`                                        |
| Edit title, add comment                       | Form actions, `useOptimistic`, `await qc.invalidate`                                                   | `src/components/edit-title.tsx`, `src/components/comments.tsx`       |

Query factories are in `src/queries.ts`, and their `queryFn`s call the server actions in `src/actions.ts`. The data comes from an in-memory fake database that waits `DB_LATENCY_MS` (default 400) ± 50% per call and resets when the server restarts.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:next
```

Then open <http://localhost:3001>.
