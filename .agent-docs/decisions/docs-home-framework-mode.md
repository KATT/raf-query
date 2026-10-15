# Homepage framework mode toggle (human asked)

- A **centered floating pill**, sticky under the site header (`top-14`), switches the homepage examples between **TanStack Start** and **Next.js**. Lost: a full-width sticky bar (heavy) and a `fixed` pill (slid under the header while the announcement bar pushed the sticky chrome down).
- The choice is `?mode=nextjs` on `/`; TanStack Start omits the param. `stripSearchParams(homeSearchDefaults)` keeps `/` from rewriting to `?mode=tanstack-start` when Zod fills the default.
- Each sample is a pair of fragments (`www/content/_home*.md` and `_home*-next.md`); the route picks which set to show. Prose for the walkthrough steps switches with the mode.
- **Next.js samples** show the App Router file split (server `page.tsx` vs client `"use client"` module). They use `prefetch` + Suspense, matching the example app — not `ensure` (that verb fits loaders; in RSC, prefer `prefetch` for streamed client reads and `fetch` when the server component renders the data itself).
- The site is static HTML: `/` is prerendered as TanStack Start. After mount, the client follows `?mode=`. Prerender skips crawled `?…` URLs (`www/vite.config.ts`).
- Lost: one sample with in-block tabs (harder to share a deep link), and a site-wide preference (this toggle is homepage-only until more docs samples need it).
