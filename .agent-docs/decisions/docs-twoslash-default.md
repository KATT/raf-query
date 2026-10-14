# Docs `ts`/`tsx` examples use Twoslash (human asked)

- **Every `ts` / `tsx` fence in `www/content` uses `twoslash`** (human): same Shiki highlighting as before, plus type-on-hover like the homepage. Bash, CSS, demos, and language-less diagrams stay plain.
- **Hidden setup** (agent): imports and declares live above `// ---cut---` (and wrappers below `// ---cut-after---` when a top-level `return` needs a function). Shared stubs are `www/content/_twoslash.ts`, plus tiny files Twoslash must resolve (`routeTree.gen.ts`, `query-client.ts`, `posts.functions.ts`). `~/…` maps to the content dir via Twoslash `paths`.
- **Verify with the Vite build** (agent): `pnpm --filter @raf-query/www build` compiles every page; a workspace-root Node check can miss `www/` resolution. Lost: leaving fragments as Shiki-only.
