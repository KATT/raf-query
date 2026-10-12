# Decisions

Append-only in spirit; rewrite in place when a decision changes. Keep each entry short.

## 2026-10-10 — Bootstrapped from vendor-src tooling, not forked

- Copied layout/mechanisms from `~/dev/vendor-src` (Vite+/pnpm workspace, husky, oxlint/oxfmt, release-it, GH workflows).
- Fresh `git init` — no shared history, not a fork.
- Excluded from the copy: `.git`, `node_modules`, `.repos` / `repos`, vendored effect tree, `vendor-src.json`, package `dist/`.
- Publishable package path: `packages/raf-query` (renamed from `packages/vendor-src`).

## 2026-10-10 — Library package, not a CLI

- Skeleton exports a library entry (`src/index.ts` → `dist/index.mjs`) only.
- No `bin`, no schema JSON, no command-reference README generator.
- Root scripts mirror vendor-src’s pack/test/typecheck/lint/format/check pattern without `postinstall` / `vendor-src check`.

## 2026-10-10 — Docs split

- Root `README.md`: product sketch / public story (human will draft ideas there).
- `AGENTS.md`: short environment + pointers agents need every session.
- `.agent-docs/`: durable agent notes (this folder). Agents may reshape it.

## 2026-10-10 — Markdown via oxfmt, not markdownlint

- Oxfmt formats `.md` and embedded JS/TS fences (`embeddedLanguageFormatting: "auto"`).
- Oxlint does **not** lint Markdown (out of scope); do not add markdownlint for parity.
- Keep `fmt` options in sync between `vite.config.ts` and `.oxfmtrc.json` (tabs, width, ignores).
- Workspace disables markdownlint (`markdownlint.enable: false` + unwanted recommendation). Keep `.markdownlint.json` with `MD010: false` as a belt-and-suspenders if the extension is still installed globally.

## 2026-10-10 — Oxc editor LSP bypasses `vp`

- Oxc VS Code prefers `vite-plus`’s `vp fmt|lint --lsp`. That crashes when the extension’s `node` is older than 22 (`styleText` missing) — Cursor’s PATH can still be Node 20.
- Workspace pins `oxc.path.oxfmt` / `oxc.path.oxlint` to the package bins and `oxc.fmt.configPath` / `oxc.configPath` to `.oxfmtrc.json` / `.oxlintrc.json`.
- `oxlint` is a direct devDependency so the bin path stays stable (not only nested under vite-plus).

## 2026-10-10 — Vendored TanStack Query

- `vendor-src` dogfoods at the workspace root (`postinstall`: `vendor-src check`).
- `@tanstack/react-query@5.104.1` → `.repos/query` (inspiration / mechanism reference for raf-query).
- Read that tree for how query caches, observers, and suspense integration actually work; don’t invent parallel APIs from memory.

## 2026-10-10 — npm release path

- Same release-it + GitHub Actions flow as vendor-src: push to `main` → `.github/workflows/release.yaml`.
- Publishes via npm OIDC trusted publishing (`id-token: write`, empty `NODE_AUTH_TOKEN`).
- Needs GitHub secret `ACCESS_TOKEN` (release push) and an npm trusted publisher on `raf-query` for workflow `release.yaml`.
