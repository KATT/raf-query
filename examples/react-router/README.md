# raf-query on React Router

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/react-router?file=/apps/react-router/app/routes/issues.tsx)

Live at [react-router.raf-query.katt.dev](https://react-router.raf-query.katt.dev).

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme). [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) and [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) are the same app on TanStack Start and the Next.js App Router, so the three integrations can be compared side by side.

| Screen / action                                         | Shows                                                                                            | Files                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL           | Loader `prefetch`es from search params, infinite scroll, `whilePending: "previous"` dimming      | `app/routes/issues.tsx`, `app/components/issue-list.tsx`                                                                           |
| Issue detail                                            | `prefetch` the issue, assignee, and comments; skeletons show while they stream                   | `app/routes/issues.$issueId.tsx`                                                                                                   |
| Comments                                                | Paged query with infinite scroll, streamed through `HydrationBoundary`                           | `app/components/comments.tsx`                                                                                                      |
| Assignee card                                           | The loader `prefetch`es the assignee by issue id beside the issue, so neither waits on the other | `app/routes/issues.$issueId.tsx`, `app/components/user.tsx`                                                                        |
| Inline-edit title and body; change status from the list | Form actions / transitions, `useOptimistic`, `await qc.invalidate`                               | `app/components/edit-title.tsx`, `app/components/edit-body.tsx`, `app/components/status-select.tsx`, `app/components/comments.tsx` |

Query factories are in `app/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the other REST examples, and `app/routes/api.$.ts` serves it. Its inputs and responses are typed by the fake database's schemas and functions. Loaders call the API in process during SSR, and over HTTP in the browser. Each loader creates a request-scoped `QueryClient`, dehydrates it, and the route wraps its tree in `HydrationBoundary` from `@raf-query/react/react-router`. The data comes from an in-memory fake database that waits the latency picked in the top bar (or `DB_LATENCY_MS`, default 400) ± 50% per call and resets when the server restarts.

The top bar's settings live in cookies, so the server renders with them too. **Prefetch links** sets `<Link prefetch>` (`app/components/settings.tsx`) and starts **off** (`none`): on intent, on render, in the viewport, or off. **Stale time** is the query client's `staleTime` (5 seconds until you pick another). **Latency** travels with each API request in the `x-db-latency` header: the client in `app/api.ts` reads the cookie (the request's during SSR through a request stack, the document's in the browser), and the API passes it to the database call. **Reset** clears the cookies, drops every query, and reloads, so the cache starts empty.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm dev:react-router
```

Then open <http://localhost:3006>.
