# raf-query on TanStack Start

> A standalone copy of [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start), generated for CodeSandbox on every release: edit the original, not this copy. The app is in `apps/tanstack-start`; the UI components and fake database it shares with the other examples are in `packages/`.

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/queries.ts)

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) is the same app on Next.js App Router, so the two integrations can be compared side by side.

| Screen / action                               | Shows                                                                                            | Files                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Issue list: status filter and sort in the URL | `validateSearch` → loader → `prefetch`, infinite scroll, `whilePending: "previous"` dimming      | `src/routes/issues.index.tsx`, `src/components/issue-list.tsx` |
| Issue detail                                  | Blocking `ensure` in the loader, keyed Suspense skeleton when switching issues                   | `src/routes/issues.$issueId.tsx`                               |
| Comments                                      | Paged query with infinite scroll, streamed `prefetch`                                            | `src/components/comments.tsx`                                  |
| Assignee card                                 | The loader `prefetch`es the assignee by issue id beside the issue, so neither waits on the other | `src/routes/issues.$issueId.tsx`, `src/components/user.tsx`    |
| Edit title, add comment                       | Form actions, `useOptimistic`, `await qc.invalidate`                                             | `src/components/edit-title.tsx`, `src/components/comments.tsx` |

Query factories are in `src/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the Next.js app, and the server route `src/routes/api.$.ts` serves it. Its inputs and responses are typed by the fake database's schemas and functions. Loaders call the API in process during SSR, and over HTTP in the browser. `src/router.tsx` wires the query client into the router with `setupRouterIntegration`. The data comes from an in-memory fake database that waits `DB_LATENCY_MS` (default 400) ± 50% per call and resets when the server restarts.

## Run it

[Open it in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/queries.ts), or locally:

```shell
pnpm install
pnpm dev
```

Then open <http://localhost:3000>.
