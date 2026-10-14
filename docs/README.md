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

## For agents

Every page is also markdown, for coding agents and chat assistants:

- `/docs/<slug>.md` is the page's markdown. Links point at the other pages' markdown, and each demo becomes a link to the web page and the demo's code.
- A page's own URL answers with the markdown when the request's `Accept` header has `text/markdown`, as agents like Claude Code send. Browsers get HTML from the same URL, and the response has `Vary: Accept`.
- `/llms.txt` ([llmstxt.org](https://llmstxt.org)) lists every page, `/llms-full.txt` has every page in one file, and `/` with `Accept: text/markdown` answers with `llms.txt`.
- HTML pages link their markdown with `<link rel="alternate" type="text/markdown">` and a `Link` header, and have "Copy page", "Markdown", "Ask ChatGPT" and "Ask Claude" buttons.

```sh
curl -H 'Accept: text/markdown' http://localhost:3004/docs/caching
```

`build/content.ts` writes these files and serves them in `pnpm dev` and `pnpm start`.

## Deploying

The Vercel project's root directory is `docs`. `vercel.json` sets the install and build commands. The build ends with `build/vercel-output.ts`, which writes [Build Output](https://vercel.com/docs/build-output-api/v3) to `.vercel/output`: the static files, cache headers, redirects and the `Accept: text/markdown` routes. `vercel.json` rewrites can't do this, because they only run when no file matches the URL. Vercel needs Node 24 (the root `package.json`'s `engines`) and pnpm from `packageManager` (set `ENABLE_EXPERIMENTAL_COREPACK=1`).
