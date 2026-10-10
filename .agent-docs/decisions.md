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
