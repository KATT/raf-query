# Example navigations prefetch (human)

- Issue pages start the issue with `prefetch`, the same as the assignee and comments. Nothing on the route `await`s, so TanStack Start commits the navigation immediately and the new page paints its skeletons.
- The back / previous / next bar reads the id from the URL. The title, body, and status each suspend on the issue. Comments and the assignee keep their own skeletons. A missing issue is `null`; the page calls `notFound()` when it reads that.
- Sibling suspense boundaries need different keys (`issue-${id}`, `comments-${id}`, and the same for status and assignee). Two boundaries that share `key={id}` make React's child map keep only the last, so the issue body stays mounted and each next or previous click appends another one.
- Next.js sends the same skeletons in the first response and streams the data after. It still spends a server round trip before that response.
- Lost: `await qc.ensure(issueQuery)` blocking the route until the issue arrived, and throwing `notFound()` from the query function.
- Files: `examples/tanstack-start/src/routes/issues.$issueId.tsx`, `examples/nextjs/src/app/issues/[issueId]/page.tsx`, `examples/nextjs/src/components/issue-page.tsx`.
