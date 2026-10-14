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

### Types in code blocks

Every `ts` / `tsx` fence uses [Twoslash](https://twoslash.netlify.app): hovering a name shows its type, as in an editor.

````md
```tsx twoslash
import { type EnsuredQueryHandle, useQuery } from "@raf-query/react";
import { postQuery } from "./_twoslash.ts";
declare const handle: EnsuredQueryHandle<typeof postQuery>;
// ---cut---
const [post] = useQuery(postQuery, handle);
//     ^?
```
````

- Code above `// ---cut---` compiles but isn't shown. Import what the block needs from `content/_twoslash.ts` there: an app's API (`getPost`, `listComments`) and factories the guides share (`postQuery`, `commentsQuery`).
- A fence folds lines with `collapse={4-9}` in its meta (Expressive Code's collapsible sections). The page shows “N collapsed lines”; a click opens the lines and another click closes them. The numbers are the lines left after `// ---cut---`. Copy still copies the folded lines.
- `// ^?` pins the type of the name above it under the line.
- `// @errors: 2345` shows an expected compiler error. Any error a block doesn't expect fails the build, so the samples stay correct as the API changes.
- In a page's markdown for agents, the hidden setup and markers are removed, and each `// ^?` becomes a comment with its type.
- Twoslash needs TypeScript's JavaScript API, which TypeScript 7 doesn't have, so it runs on `typescript6` (TypeScript 6). Restart `pnpm dev` after editing `content/_twoslash.ts`.

## Demos

A fenced `demo` block embeds a live demo:

````md
```demo
polling
```
````

The name is a file in `src/demos/`, which default-exports `defineDemo({ Component, server, title, hint })`. A demo talks to a fake server from `createFakeServer` (`src/demo-kit/server.ts`) instead of the network, and gets its own query client, a network panel, a cache panel and an expanded view with the devtools.

- To compare ways of doing the same thing, pass `variants` (each a `Component`, `server`, `label` and `description`) instead of `Component` and `server`. The frame shows a switch and gives each variant its own client. Every variant opened stays mounted in a hidden `<Activity>`, so switching back finds its page and requests as they were.
- `DemoRouter` (`src/demo-kit/router.tsx`) runs a TanStack Router route tree in the demo's browser window, on a memory history, with the client as `context.queryClient`. Its Reload starts the variant over on the same URL. `DemoBrowser` is a smaller hand-rolled router that the other demos use.
- The docs site registers its own router type, so demo routes name theirs: `route.useLoaderData<typeof router>()`, and `Link` with all its type parameters. See `src/demos/starting-queries.tsx`.
- `pnpm test` runs the demos' tests (Vitest, happy-dom).

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

The Vercel project's root directory is `www`. `vercel.json` sets the install and build commands. The build ends with `build/vercel-output.ts`, which writes [Build Output](https://vercel.com/docs/build-output-api/v3) to `.vercel/output`: the static files, cache headers, redirects and the `Accept: text/markdown` routes. `vercel.json` rewrites can't do this, because they only run when no file matches the URL. Vercel needs Node 24 (the root `package.json`'s `engines`) and pnpm from `packageManager` (set `ENABLE_EXPERIMENTAL_COREPACK=1`).
