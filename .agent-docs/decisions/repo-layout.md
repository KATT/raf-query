# Repo layout

- Vite+/pnpm workspace, husky, oxlint/oxfmt, release-it, GitHub workflows.
- Publishable packages: `packages/core` (`@raf-query/core`) and `packages/react` (`@raf-query/react`), each a library entry only (`src/index.ts` → `dist/index.js`). No `bin`.
- Root scripts fan out with `pnpm -r --filter`: `build` (packages), `build:examples`, `test` (packages, tooling), `typecheck` (examples, packages, tooling). Lint / format / check run once at the root. CI has a Build Examples job.
- Package `exports` point at `./src/index.ts` so workspace consumers (react → core, examples) need no build; `publishConfig.exports` swaps in `./dist/index.js`, which `pnpm pack` applies. `dist/` is `tsc -p tsconfig.build.json` output ([bundle-size-cuts.md](./bundle-size-cuts.md)).
- Root `scripts/` holds repo scripts (`sync-package-docs.ts`); root `CHANGELOG.md` is shared by both packages.
