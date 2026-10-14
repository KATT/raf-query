# Docs `ts`/`tsx` examples use Twoslash (human asked)

- **Every `ts` / `tsx` fence in `www/content` uses `twoslash`** (human): same Shiki highlighting as before, plus type-on-hover like the homepage. Bash, CSS, demos, and language-less diagrams stay plain.
- **Hidden setup** (agent): imports and declares live above `// ---cut---` (and wrappers below `// ---cut-after---` when a top-level `return` needs a function). What blocks share is the shared app, `www/content/_shared` (see [docs-example-files.md](./docs-example-files.md)), imported as `~/…`. A directive (`"use client"`) stays the first line, with hidden imports below it between `// ---cut-start---` and `// ---cut-end---`: below imports it's a plain string, which the formatter wraps as `("use client");`.
- **Verify with the Vite build** (agent): `pnpm --filter @raf-query/www build` compiles every page; a workspace-root Node check can miss `www/` resolution. Lost: leaving fragments as Shiki-only.
