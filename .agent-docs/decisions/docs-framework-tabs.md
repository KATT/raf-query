# Docs framework tabs; the quick start assumes no integration (human asked)

Human: "don't assume which integration someone is using in quickstart for instance".

- **Framework tabs**: adjacent fences with `framework="tanstack-start" | "nextjs" | "react-router"` in their meta become one block with a tab per framework (`remarkFrameworkTabs` in `www/build/markdown.ts`). Every framework needs a fence, so no reader lands on an empty tab. A framework can have several fences, shown together. `sample` fences pass the meta through (`www/build/snippets.ts`).
- **One choice, site-wide**: a tab sets `data-framework-mode` on `<html>` (the attribute the homepage switch uses, so the same CSS shows panels) and stores it in `localStorage` (`frameworkModeStorageKey`). `frameworkModeScript` applies it before paint on every page but `/`, which keeps `?mode=`. The homepage switch also stores its choice. Clicking a tab keeps the tab where it was on screen (`chooseFrameworkTab` in `doc-body.tsx`).
- **Where tabs go**: blocks that start or read queries in a framework-specific way (quick start, overview, starting queries, request waterfalls, pagination, the comparison's loader sample). The rest of the guides' samples are framework-neutral: components take handles as props instead of `Route.useLoaderData()`.
- **Agent markdown** keeps each fence with its `framework="…"` meta, one after another.
- Lost: a quick start on TanStack Start with a pointer to the other integration pages; per-block tabs that don't share a choice.
