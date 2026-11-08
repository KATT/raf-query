# Repo layout

- Vite+/pnpm workspace, husky, oxlint/oxfmt, release-it, GitHub workflows.
- Publishable packages: `packages/core` (`@raf-query/core`), and `packages/react` (`@raf-query/react`), each library entries only (`src/index.ts` → `dist/index.mjs`, plus `@raf-query/react/tanstack-router` and `@raf-query/core/internal`). No `bin`.
- Root scripts fan out with `pnpm -r --filter`: `build` (packages), `build:examples`, `test` (packages, tooling), `typecheck` (examples, packages, tooling). Lint / format / check run once at the root. CI has a Build Examples job.
- Package `exports` point at `./src/*.ts` so workspace consumers (react → core, examples) need no build; `publishConfig.exports` swaps in `./dist/*.mjs`, which `pnpm pack` applies.
- Root `scripts/` holds repo scripts (`sync-package-docs.ts`); root `CHANGELOG.md` is shared by every package.
