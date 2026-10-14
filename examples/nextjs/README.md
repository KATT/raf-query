# raf-query on Next.js App Router

> A standalone copy of [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs), generated for CodeSandbox on every release: edit the original, not this copy. The app is in `apps/nextjs`; the UI components and fake database it shares with the other examples are in `packages/`.

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/issues/page.tsx)

Live at [nextjs.raf-query.katt.dev](https://nextjs.raf-query.katt.dev).

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is the same app on TanStack Start, so the two integrations can be compared side by side.

| Screen / action                                         | Shows                                                                                                  | Files                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL           | Server component `prefetch`es from `searchParams`, infinite scroll, `whilePending: "previous"` dimming | `src/app/issues/page.tsx`, `src/components/issue-list.tsx`                                                                         |
| Issue detail                                            | `prefetch` the assignee by issue id beside the issue, so neither waits on the other                    | `src/app/issues/[issueId]/page.tsx`, `src/components/issue-page.tsx`                                                               |
| Comments                                                | Paged query with infinite scroll, streamed through `HydrationBoundary`                                 | `src/components/comments.tsx`                                                                                                      |
| Inline-edit title and body; change status from the list | Form actions / transitions, `useOptimistic`, `await qc.invalidate`                                     | `src/components/edit-title.tsx`, `src/components/edit-body.tsx`, `src/components/status-select.tsx`, `src/components/comments.tsx` |

Query factories are in `src/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the TanStack Start app, and `src/app/api/[...path]/route.ts` serves it. Its inputs and responses are typed by the fake database's schemas and functions. Server components call the API in process; the browser calls it over HTTP, in parallel. The data comes from an in-memory fake database that waits the latency picked in the top bar (or `DB_LATENCY_MS`, default 400) ± 50% per call and resets when the server restarts.

The top bar's settings live in cookies, so the server renders with them too, and **Reset** clears them. **Prefetch links** sets how `AppLink` (`src/components/settings.tsx`), the app's `next/link`, prefetches: Next.js's default, the full route in the viewport, the full route on hover or focus, or off. Next.js only prefetches in production builds (`pnpm build && pnpm start`). **Latency** travels with each API request in the `x-db-latency` header: the client in `src/api.ts` reads the cookie (the request's on the server through `next/headers`, the document's in the browser; see `#latency-cookie` in `package.json`), and the API passes it to the database call.

## Run it

[Open it in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/issues/page.tsx), or locally:

```shell
pnpm install
pnpm dev
```

Then open <http://localhost:3001>.
