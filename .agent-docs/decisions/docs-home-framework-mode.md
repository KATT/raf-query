# Homepage framework mode toggle (human asked)

- A **centered floating pill** under the site header switches the homepage examples between **TanStack Start** and **Next.js**. The choice is `?mode=nextjs` on `/` (TanStack Start omits the param). Lost: a full-width sticky bar (felt heavy).
- Each sample is a pair of fragments (`www/content/_home*.md` and `_home*-next.md`); the route picks which set to show. Prose for the walkthrough steps switches with the mode.
- **Next.js samples** show the App Router file split (server `page.tsx` vs client `"use client"` module). They use `prefetch` + Suspense, matching the example app — not `ensure` (that verb fits loaders; in RSC, prefer `prefetch` for streamed client reads and `fetch` when the server component renders the data itself).
- The site is static HTML: `/` is prerendered as TanStack Start. After mount, the client follows `?mode=`. Prerender skips crawled `?…` URLs (`www/vite.config.ts`).
- Lost: one sample with in-block tabs (harder to share a deep link), and a site-wide preference (this toggle is homepage-only until more docs samples need it).
