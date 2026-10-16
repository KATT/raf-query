# raf-query on Next.js App Router

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/issues/page.tsx)

Live at [nextjs.raf-query.katt.dev](https://nextjs.raf-query.katt.dev).

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) is the same app on TanStack Start, so the two integrations can be compared side by side.

| Screen / action                                         | Shows                                                                                                  | Files                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL           | Server component `prefetch`es from `searchParams`, infinite scroll, `whilePending: "previous"` dimming | `src/app/issues/page.tsx`, `src/app/issues/_components/issue-list.tsx`                                                                                   |
| Issue detail                                            | `prefetch` the issue, assignee, and comments; skeletons show while they stream                         | `src/app/issues/[issueId]/page.tsx`, `src/app/issues/[issueId]/_components/issue-page.tsx`                                                               |
| Comments                                                | Paged query with infinite scroll, streamed through `HydrationBoundary`                                 | `src/app/issues/[issueId]/_components/comments.tsx`                                                                                                      |
| Inline-edit title and body; change status from the list | Form actions / transitions, `useOptimistic`, `await qc.invalidate`                                     | `src/components/edit-title.tsx`, `src/components/edit-body.tsx`, `src/components/status-select.tsx`, `src/app/issues/[issueId]/_components/comments.tsx` |

The markup all four example apps share (issue rows, the status menu, comments, skeletons, the settings controls) is in [`examples/.shared/kit`](https://github.com/KATT/raf-query/tree/main/examples/.shared/kit). Every query, loader, and save stays in this app.

Query factories are in `src/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the TanStack Start app, and `src/app/api/[...path]/route.ts` serves it. Its inputs and responses are typed by the fake database's schemas and functions. Server components call the API in process; the browser calls it over HTTP, in parallel. The data comes from an in-memory fake database that waits the latency picked in the top bar (or `DB_LATENCY_MS`, default 400) ± 50% per call and resets when the server restarts.

The top bar's settings live in cookies, so the server renders with them too. **Prefetch links** sets how `AppLink` (`src/components/settings.tsx`), the app's `next/link`, prefetches, and starts **off**: the full route in the viewport (`prefetch={true}`), the full route on hover or focus, or off (`prefetch={false}`). Next.js only prefetches in production builds (`pnpm build && pnpm start`). **Stale time** is the query client's `staleTime` (5 seconds until you pick another). **Latency** is a cookie the API reads, as a real API reads its session: the browser sends it, and server components forward the page request's `cookie` header (`src/forwarded-headers.server.ts`, picked by the `react-server` condition of `#forwarded-headers` in `package.json`). The API passes it to the database call. **Reset** clears the cookies, drops every query, and reloads, so the cache starts empty.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:next
```

Then open <http://localhost:3001>.
