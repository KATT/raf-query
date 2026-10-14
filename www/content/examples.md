---
title: Examples
description: The same issue tracker built on TanStack Start and on the Next.js App Router, running live and ready to open in CodeSandbox.
section: Getting started
order: 5
---

The repository has one app built twice: a small issue tracker on [TanStack Start](https://tanstack.com/start) and on the [Next.js App Router](https://nextjs.org/docs/app), so the two integrations can be compared side by side. Each runs live on Vercel, and opens in CodeSandbox, which runs it on a cloud VM.

| Example       | Framework          | Source                                                                                           | Live                                                                           | Try it                                                                                                                                                                      |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue tracker | TanStack Start     | [`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) | [tanstack-start.raf-query.katt.dev](https://tanstack-start.raf-query.katt.dev) | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/tanstack-start?file=/apps/tanstack-start/src/routes/issues.index.tsx) |
| Issue tracker | Next.js App Router | [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs)                 | [nextjs.raf-query.katt.dev](https://nextjs.raf-query.katt.dev)                 | [Open in CodeSandbox](https://codesandbox.io/p/devbox/github/KATT/raf-query/tree/codesandbox/examples/nextjs?file=/apps/nextjs/src/app/issues/page.tsx)                     |

## What they cover

Every feature in these docs appears somewhere in the app:

| Screen or action                                        | Shows                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Issue list with status filter and sort                  | Search params → loader → paged `prefetch`, infinite scroll, `whilePending: "previous"`, `isPrevious` dimming |
| Issue detail                                            | `prefetch`, so the page opens onto skeletons for the title, body, and status                                 |
| Comments under an issue                                 | A paged query, streamed `prefetch`, infinite scroll                                                          |
| Assignee card                                           | The loader or server component prefetches the assignee by issue id, next to the issue, so nothing waits      |
| Inline-edit title and body; change status from the list | Form Actions / transitions, `useOptimistic` and `await qc.invalidate(...)`                                   |

Data comes from an in-memory database with artificial latency (400 ms ± 50% per call), behind a small REST API both apps share. Data the server loads for the first render streams in with the HTML; later loads show up in the browser's network tab.

## Run them locally

```bash
git clone https://github.com/KATT/raf-query
cd raf-query
pnpm install
pnpm dev:start   # TanStack Start on http://localhost:3000
pnpm dev:next    # Next.js on http://localhost:3001
```

## Demos in these docs

The guides embed live demos that run entirely in your browser. Each has its own query client and a fake server with adjustable latency, and shows its requests as a waterfall and its cache entries as they change. **Expand** opens the same demo in a dialog next to the [devtools](./devtools.md) panel. Good places to start:

- [Starting queries](./starting-queries.md): prefetch, ensure and fetch
- [Caching](./caching.md): fresh, stale, inactive and garbage-collected entries
- [URL state and pagination](./url-state-and-pagination.md): `whilePending`
- [Mutations](./mutations.md): optimistic updates that roll back
- [Request waterfalls](./request-waterfalls.md): chained versus parallel loading
