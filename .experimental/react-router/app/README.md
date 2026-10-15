# raf-query on React Router (experimental)

A small issue tracker built with [raf-query](https://github.com/KATT/raf-query#readme) on [React Router](https://reactrouter.com) Framework Mode. Part of the [`.experimental/react-router`](../) experiment — not listed on the docs site yet. Draft guide: [`../docs/react-router.md`](../docs/react-router.md).

[`examples/tanstack-start`](https://github.com/KATT/raf-query/tree/main/examples/tanstack-start) and [`examples/nextjs`](https://github.com/KATT/raf-query/tree/main/examples/nextjs) are the same app on TanStack Start and the Next.js App Router.

| Screen / action                                         | Shows                                                                                            | Files                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Issue list: status filter and sort in the URL           | Loader `prefetch`es from search params, infinite scroll, `whilePending: "previous"` dimming      | `app/routes/issues.tsx`, `app/components/issue-list.tsx`                                                                           |
| Issue detail                                            | `prefetch` the issue, assignee, and comments; skeletons show while they stream                   | `app/routes/issues.$issueId.tsx`                                                                                                   |
| Comments                                                | Paged query with infinite scroll, streamed through `HydrationBoundary`                           | `app/components/comments.tsx`                                                                                                      |
| Assignee card                                           | The loader `prefetch`es the assignee by issue id beside the issue, so neither waits on the other | `app/routes/issues.$issueId.tsx`, `app/components/user.tsx`                                                                        |
| Inline-edit title and body; change status from the list | Form actions / transitions, `useOptimistic`, `await qc.invalidate`                               | `app/components/edit-title.tsx`, `app/components/edit-body.tsx`, `app/components/status-select.tsx`, `app/components/comments.tsx` |

The markup all four example apps share (issue rows, the status menu, comments, skeletons, the settings controls) is in [`examples/.shared/kit`](https://github.com/KATT/raf-query/tree/main/examples/.shared/kit). Every query, loader, and save stays in this app.

Query factories are in `app/queries.ts`. Loaders create a request-scoped `QueryClient`, dehydrate it, and the route wraps its tree in `HydrationBoundary` from `@raf-query/react/react-router`.

## Run it

From the root of this repo:

```shell
pnpm install
pnpm --filter @examples/experimental-react-router dev
```

Then open <http://localhost:3006>.
