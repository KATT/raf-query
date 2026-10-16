---
title: Examples
description: The same issue tracker built on TanStack Start, on the Next.js App Router, on React Router Framework Mode, and on TanStack Start with Effect, ready to open in CodeSandbox.
section: Getting started
order: 5
---

The repository has one app built four times: a small issue tracker on [TanStack Start](https://tanstack.com/start), on the [Next.js App Router](https://nextjs.org/docs/app) and on [React Router Framework Mode](https://reactrouter.com/start/modes#framework), so the integrations can be compared side by side, and on TanStack Start again, written with [Effect](./effect.md) end to end. Each runs live on Vercel, and opens in CodeSandbox, which runs it on a cloud VM.

| Example       | Framework                             | Source                                                                                                         | Live                                                                                         | Try it                                                                                                                                                                                    |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue tracker | TanStack Start                        | [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start)               | [tanstack-start.raf-query.katt.dev](https://tanstack-start.raf-query.katt.dev)               | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/routes/issues/index.tsx)               |
| Issue tracker | Next.js App Router                    | [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs)                               | [nextjs.raf-query.katt.dev](https://nextjs.raf-query.katt.dev)                               | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/issues/page.tsx)                                   |
| Issue tracker | React Router Framework Mode           | [`examples/react-router`](https://github.com/KATT/raf-query/tree/main/examples/react-router)                   | [react-router.raf-query.katt.dev](https://react-router.raf-query.katt.dev)                   | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/react-router?file=/apps/react-router/app/routes/issues/route.tsx)                   |
| Issue tracker | TanStack Start, Effect and Effect RPC | [`examples/tanstack-start-effect`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start-effect) | [tanstack-start-effect.raf-query.katt.dev](https://tanstack-start-effect.raf-query.katt.dev) | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start-effect?file=/apps/tanstack-start-effect/src/routes/issues/index.tsx) |

## What they cover

Every feature in these docs appears somewhere in the app:

| Screen or action                                        | Shows                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Issue list with status filter and sort                  | Search params → loader → paged `prefetch`, infinite scroll, `whilePending: "previous"`, `isPrevious` dimming |
| Issue detail                                            | `prefetch`, so the page opens onto skeletons for the title, body, and status                                 |
| Comments under an issue                                 | A paged query, streamed `prefetch`, infinite scroll                                                          |
| Assignee card                                           | The loader or server component prefetches the assignee by issue id, next to the issue, so nothing waits      |
| Inline-edit title and body; change status from the list | Form Actions / transitions, `useOptimistic` and `await qc.invalidate(...)`                                   |

Data comes from an in-memory database with artificial latency (400 ms ± 50% per call), behind a small REST API the TanStack Start, Next.js and React Router apps share. The top bar sets that latency, how links prefetch, and how long cached data stays fresh. **Reset** clears those choices and the query cache, then reloads. The Effect app serves it as an Effect RPC group instead: its `queryFn`s, loaders and form actions are Effects, and they catch its [typed errors](./effect-errors.md) with `Effect.catchTag`. Data the server loads for the first render streams in with the HTML; later loads show up in the browser's network tab.

## Run them locally

```bash
git clone https://github.com/KATT/raf-query
cd raf-query
pnpm install
pnpm dev:start         # TanStack Start on http://localhost:3000
pnpm dev:next          # Next.js on http://localhost:3001
pnpm dev:react-router  # React Router on http://localhost:3006
pnpm dev:effect        # TanStack Start with Effect on http://localhost:3005
```

## Demos in these docs

The guides embed live demos that run entirely in your browser. Each has its own query client and a fake server with adjustable latency, and shows its requests as a waterfall and its cache entries as they change. **Expand** opens the same demo in a dialog next to the [devtools](./devtools.md) panel. Good places to start:

- [Starting queries](./starting-queries.md): prefetch, ensure and fetch
- [Caching](./caching.md): fresh, stale, inactive and garbage-collected entries
- [URL state and pagination](./url-state-and-pagination.md): `whilePending`
- [Mutations](./mutations.md): optimistic updates that roll back
- [Request waterfalls](./request-waterfalls.md): chained versus parallel loading
