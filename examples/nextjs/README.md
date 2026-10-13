# raf-query on Next.js App Router

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/queries.ts)

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is the same app on TanStack Start, so the two integrations can be compared side by side.

| Screen / action                               | Shows                                                                                                  | Files                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL | Server component `prefetch`es from `searchParams`, infinite scroll, `whilePending: "previous"` dimming | `src/app/issues/page.tsx`, `src/components/issue-list.tsx`           |
| Issue detail                                  | `await qc.fetch` the issue, then `prefetch` its assignee                                               | `src/app/issues/[issueId]/page.tsx`, `src/components/issue-page.tsx` |
| Comments                                      | Paged query with infinite scroll, streamed through `HydrationBoundary`                                 | `src/components/comments.tsx`                                        |
| Edit title, add comment                       | Form actions, `useOptimistic`, `await qc.invalidate`                                                   | `src/components/edit-title.tsx`, `src/components/comments.tsx`       |

Query factories are in `src/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the TanStack Start app, and `src/app/api/[...path]/route.ts` serves it. Its inputs and responses are typed by the fake database's schemas and functions. Server components call the API in process; the browser calls it over HTTP, in parallel. The data comes from an in-memory fake database that waits `DB_LATENCY_MS` (default 400) ± 50% per call and resets when the server restarts.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:next
```

Then open <http://localhost:3001>.
