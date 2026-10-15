# raf-query on React Router

> A standalone copy of [`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router), generated for CodeSandbox on every release: edit the original, not this copy. The app is in `apps/react-router`; the UI components and fake database it shares with the other examples are in `packages/`.

[![Open in CodeSandbox](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/react-router?file=/apps/react-router/app/routes/issues.tsx)

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme) on [React Router](https://reactrouter.com) Framework Mode. [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) and [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) are the same app on TanStack Start and the Next.js App Router, so the integrations can be compared side by side.

| Screen / action                                         | Shows                                                                                            | Files                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL           | Loader `prefetch`es from search params, infinite scroll, `whilePending: "previous"` dimming      | `app/routes/issues.tsx`, `app/components/issue-list.tsx`                                                                           |
| Issue detail                                            | `prefetch` the issue, assignee, and comments; skeletons show while they stream                   | `app/routes/issues.$issueId.tsx`                                                                                                   |
| Comments                                                | Paged query with infinite scroll, streamed through `HydrationBoundary`                           | `app/components/comments.tsx`                                                                                                      |
| Assignee card                                           | The loader `prefetch`es the assignee by issue id beside the issue, so neither waits on the other | `app/routes/issues.$issueId.tsx`, `app/components/user.tsx`                                                                        |
| Inline-edit title and body; change status from the list | Form actions / transitions, `useOptimistic`, `await qc.invalidate`                               | `app/components/edit-title.tsx`, `app/components/edit-body.tsx`, `app/components/status-select.tsx`, `app/components/comments.tsx` |

The markup all four example apps share (issue rows, the status menu, comments, skeletons, the settings controls) is in [`examples/.shared/kit`](https://github.com/KATT/raf-query/tree/main/examples/.shared/kit). Every query, loader, and save stays in this app.

Query factories are in `app/queries.ts`. Their `queryFn`s, and the form actions, call a REST API through its typed [Hono](https://hono.dev) client. The API lives in [`examples/.shared/api`](https://github.com/KATT/raf-query/tree/main/examples/.shared/api), shared with the other apps, and the resource route `app/routes/api.$.ts` serves it. Each loader creates a `QueryClient` for its request, starts the route's queries, and returns `dehydrate(qc)`; the route wraps its tree in `HydrationBoundary` from `@raf-query/react/react-router`, which writes that state into the browser's client. The data comes from an in-memory fake database that waits the latency picked in the top bar (or `DB_LATENCY_MS`, default 400) ± 50% per call and resets when the server restarts.

The top bar's settings live in cookies, so the server renders with them too. **Prefetch links** sets `<Link prefetch>` on every link in the app (`app/components/app-link.tsx`) and starts **off**: on intent, in the viewport, on render, or off. **Stale time** is the query client's `staleTime` (5 seconds until you pick another). **Latency** is a cookie the API reads, as a real API reads its session: the browser sends it, and loaders forward the page request's `cookie` header (`app/settings.ts`). The API passes it to the database call. **Reset** clears the cookies, drops every query, and reloads, so the cache starts empty.

## Run it

[Open it in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/react-router?file=/apps/react-router/app/routes/issues.tsx), or locally:

```shell
pnpm install
pnpm dev
```

Then open <http://localhost:3006>.
