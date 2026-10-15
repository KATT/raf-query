# Homepage framework mode toggle (human asked)

- A sticky bar under the site header switches the homepage examples between **TanStack Start** and **Next.js**. The choice is `?mode=nextjs` on `/` (TanStack Start omits the param).
- Each sample is a pair of fragments (`www/content/_home*.md` and `_home*-next.md`); the route picks which set to show. Prose for the walkthrough steps switches with the mode.
- The site is static HTML: `/` is prerendered as TanStack Start. After mount, the client follows `?mode=`. Prerender skips crawled `?…` URLs (`www/vite.config.ts`).
- Lost: one sample with in-block tabs (harder to share a deep link), and a site-wide preference (this toggle is homepage-only until more docs samples need it).
