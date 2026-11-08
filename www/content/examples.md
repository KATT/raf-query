---
title: Examples
description: The same issue tracker built on TanStack Start, on the Next.js App Router and on React Router Framework Mode, ready to open in CodeSandbox.
section: Getting started
order: 5
---

The repository has one app built three times: a small issue tracker on [TanStack Start](https://tanstack.com/start), on the [Next.js App Router](https://nextjs.org/docs/app) and on [React Router Framework Mode](https://reactrouter.com/start/modes#framework), so the integrations can be compared side by side. Each runs live on Vercel, and opens in CodeSandbox, which runs it on a cloud VM.

| Example       | Framework                   | Source                                                                                           | Live                                                                           | Try it                                                                                                                                                                               |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issue tracker | TanStack Start              | [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) | [tanstack-start.raf-query.katt.dev](https://tanstack-start.raf-query.katt.dev) | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/routes/prefetch/issues/index.tsx) |
| Issue tracker | Next.js App Router          | [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs)                 | [nextjs.raf-query.katt.dev](https://nextjs.raf-query.katt.dev)                 | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/prefetch/issues/page.tsx)                     |
| Issue tracker | React Router Framework Mode | [`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router)     | [react-router.raf-query.katt.dev](https://react-router.raf-query.katt.dev)     | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/react-router?file=/apps/react-router/app/routes/prefetch/issues/route.tsx)     |

## What they cover

What each part of the app shows:

| Screen or action                                        | Shows                                                                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader verb                                             | The URL's first segment picks how loaders start queries with `load`: [`prefetch`, `swr` or `revalidate`](./starting-queries.md) (`/swr/issues/3`)                           |
| Progress bar along the top                              | The router's own pending state while `swr` and `revalidate` wait: `useRouterState`, `useNavigation`, or Next.js's `useLinkStatus`                                           |
| Issue list with status filter and sort                  | Search params → loader → paged query, infinite scroll, `whilePending: "previous"`, `isPrevious` dimming                                                                     |
| Issue detail                                            | Under `prefetch` the page opens onto skeletons for the title, body, and status; `swr` and `revalidate` wait for them                                                        |
| Comments under an issue                                 | A paged query, streamed under `prefetch`, infinite scroll                                                                                                                   |
| Assignee card                                           | The loader or server component starts the assignee by issue id, next to the issue, so neither waits on the other                                                            |
| Inline-edit title and body; change status from the list | Form Actions / transitions, `useOptimistic` and `await invalidateMany(queryClient, issues)`, which invalidates every query in the `issues` [group](./query-invalidation.md) |

Data comes from an in-memory database with artificial latency (400 ms ± 50% per call), behind a small REST API the three apps share. The top bar's **Loader** select switches the loader verb, and keeps the page you are on. On Next.js and React Router every navigation renders on the server with a new client, so `swr` waits as long as `revalidate` there; in the TanStack Start app, loaders run in the browser and `swr` shows cached data at once. The top bar sets that latency, how links prefetch, and how long cached data stays fresh. **Reset** clears those choices and the query cache, then reloads. Data the server loads for the first render streams in with the HTML; later loads show up in the browser's network tab.

## Run them locally

```bash
git clone https://github.com/KATT/raf-query
cd raf-query
pnpm install
pnpm dev:start         # TanStack Start on http://localhost:3000
pnpm dev:next          # Next.js on http://localhost:3001
pnpm dev:react-router  # React Router on http://localhost:3006
```

## Demos in these docs

The guides embed live demos that run entirely in your browser. Each has its own query client and a fake server with adjustable latency, and shows its requests as a waterfall and its cache entries as they change. **Expand** opens the same demo in a dialog next to the [devtools](./devtools.md) panel. Good places to start:

- [Starting queries](./starting-queries.md): `prefetch`, `swr` and `revalidate`
- [Caching](./caching.md): fresh, stale, inactive and garbage-collected entries
- [URL state and pagination](./url-state-and-pagination.md): `whilePending`
- [Mutations](./mutations.md): optimistic updates that roll back
- [Request waterfalls](./request-waterfalls.md): chained versus parallel loading
