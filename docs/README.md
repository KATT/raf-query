# raf-query docs

The documentation site at [raf-query.katt.dev](https://raf-query.katt.dev): a TanStack Start app, prerendered to static HTML, that loads its own pages with raf-query.

```sh
pnpm dev        # http://localhost:3004
pnpm build      # static site in dist/client
pnpm start      # serve the build
```

## Writing pages

Pages are `content/<slug>.md`, served at `/docs/<slug>`:

```md
---
title: Polling
description: One sentence for search results and social cards.
section: Guides # one of `sections` in src/site.ts
order: 16 # position in the section
---
```

- Link other pages as `./slug.md` or `./slug.md#heading`. The build fails on a link to a page or heading that doesn't exist.
- `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]` and friends render as callouts.
- A code fence can take a title: ` ```ts title="src/queries.ts" `.

## Demos

A fenced `demo` block embeds a live demo:

````md
```demo
polling
```
````

The name is a file in `src/demos/`, which default-exports `defineDemo({ Component, server, title, hint })`. A demo talks to a fake server from `createFakeServer` (`src/demo-kit/server.ts`) instead of the network, and gets its own query client, a network panel, a cache panel and an expanded view with the devtools.

## Deploying

The Vercel project's root directory is `docs`. `vercel.json` sets the build and output directory, cache headers and redirects. Vercel needs Node 24 (the root `package.json`'s `engines`) and pnpm from `packageManager` (set `ENABLE_EXPERIMENTAL_COREPACK=1`).
