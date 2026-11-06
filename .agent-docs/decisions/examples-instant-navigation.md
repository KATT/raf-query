# Example navigations prefetch (human)

- Under `/prefetch`, issue pages start the issue with `prefetchEntry`, the same as the assignee and comments. The loader's `load` resolves at once, so TanStack Start commits the navigation immediately and the new page paints its skeletons.
- The back / previous / next bar reads the id from the URL. The title, body, and status each suspend on the issue. Comments and the assignee keep their own skeletons. A missing issue is `null`; the page calls `notFound()` when it reads that.
- Previous and next stay on the same route, so the page remounts per id at the router level, not with keys on each suspense boundary. The TanStack Start app sets `remountDeps: (opts) => opts.params` on the route; React Router keys the page's root by `data.id`; Next.js remounts the page segment on its own when its dynamic param changes. A remounted page shows its skeletons for the new issue instead of the old one's content.
- Next.js sends the same skeletons in the first response and streams the data after. It spends a server round trip before that response.
- Lost: blocking the route until the issue arrives (that's what the `/ensure` and `/fetch` routes show, see [loader-verb-url.md](./loader-verb-url.md)), and throwing `notFound()` from the query function.
- Files: `examples/tanstack-start/src/routes/prefetch/issues/$issueId/route.tsx`, `examples/react-router/app/routes/prefetch/issues/$issueId/route.tsx`, `examples/nextjs/src/app/prefetch/issues/[issueId]/page.tsx`, `examples/nextjs/src/app/prefetch/issues/[issueId]/_components/issue-page.tsx`.
