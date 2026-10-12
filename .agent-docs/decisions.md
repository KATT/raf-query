# Decisions

Append-only in spirit; rewrite in place when a decision changes. Keep each entry short.

## 2026-10-10 — Repo layout

- Vite+/pnpm workspace, husky, oxlint/oxfmt, release-it, GitHub workflows.
- Skeleton publishable package: `packages/raf-query`, a library entry only (`src/index.ts` → `dist/index.mjs`). No `bin`.
- Root scripts: pack / test / typecheck / lint / format / check.

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

## 2026-10-10 — Vendored TanStack source

- `vendor-src` manages `.repos/` from `vendor-src.json` (`postinstall`: `vendor-src check`).
- `@tanstack/react-query@5.104.1` → `.repos/query`, `@tanstack/react-router@1.170.42` → `.repos/router`. Mechanism reference for raf-query.
- Read those trees for how caches, observers, hydration, and router SSR actually work; don’t invent parallel APIs from memory.

## 2026-10-12 — Public API shape (human picked)

Spec lives in root `README.md`. Picks, and what lost:

- **Read API: `[promise, controls] = useQuery(factory, handle)` + `use()`.** Lost: suspense-direct `{ data } = useQuery(...)` (hides `use()`, can't pass promises down; could be sugar later), registry-based `useQuery(handle)` (every definition in the root bundle, global name uniqueness).
- **Definitions: TanStack-style factories `(input?) => queryOptions({ queryKey, queryFn })`.** Lost: `defineQuery({ name, fn })` with derived keys. Consequence: invalidation is by `(factory, input)` or key-prefix filter, not by definition alone.
- **Hydration: cache-level stream, handles are `{ key, input }` only.** Lost: handle-carried promises. Consequence: handles never carry data, so `qc.fetch()` exists for RSC rendering / dependent loader inputs, and every framework needs an integration (`/tanstack-router`, `/rsc`, `/next`).
- **Engine: own core**, copying mechanisms from TanStack — not a wrapper around `@tanstack/query-core`. See [implementation-notes.md](./implementation-notes.md).
- **Paged vs plain is decided only by the factory** (`infiniteQueryOptions` vs `queryOptions`). One `useQuery`, one set of verbs; no `useInfiniteQuery` / `prefetchInfinite` / etc. Paging controls and the `{ pages: n }` server option exist only on paged factories' types.
- **Verbs:** `prefetch` (sync → handle), `ensure` (→ `Promise<handle>`), `fetch` (→ `Promise<data>`). `useWaterfall` is the only render-time starter.
- **Mutations:** no `useMutation`; Actions + `qc.invalidate` / `setData`, React's `useOptimistic` for optimistic UI.
- **URL drives input.** No read-site input override (`useQuery(..., { input })` was removed); don't put `useState`-derived query input in README examples. Search params → `loaderDeps` → `prefetch`.
- **Pending-input behavior is `whilePending: "suspend" | "previous"`**, with `isPrevious` in controls, instead of TanStack's `placeholderData: keepPreviousData` + `isPlaceholderData`. `"suspend"` relies on both routers committing navigations in `startTransition` (TanStack Router: `link.ts` "All navigations now use startTransition under the hood"; `Transitioner.tsx`). Skeleton-on-change is a keyed Suspense (`key={state.hash}`), not a third mode — a hook can't force an already-revealed boundary back to its fallback inside a transition.
- **No refetch on mount.** Loaders, invalidation, focus/reconnect-while-stale, `refetch()`, `refetchInterval` are the only refetch triggers.
- **Server-only factories** (importing DB code) can't be read by client hooks; pass a plain promise prop or render in RSC. (An earlier proposal for a `server: true` flag didn't work: the client component would still have to import the factory.)
- **Effect is a runtime dependency of both libraries** (human, 2026-10-12). Use it for subscriptions, dedupe, scheduling, retries — functionally like TanStack Query, not a line-by-line port. Public API is Promise-first **and** exposes Effect-native entry points (e.g. Effect-returning `queryFn`, Stream-based subscriptions). Versions come from the `catalog:` in `pnpm-workspace.yaml`; source is vendored at `.repos/effect` — read it (start with its `LLMS.md`) before writing Effect code.

## 2026-10-12 — Two packages, React-agnostic core

- `@raf-query/core` (framework-agnostic, mirrors `@tanstack/query-core`) and `@raf-query/react` (bindings, re-exports core — apps install only this).
- Framework integrations are subpath exports of `@raf-query/react` (`/tanstack-router`, `/rsc`, `/next`), not separate packages.
- **Lockstep versions:** both packages always share a version and release together.
- Not done yet: `packages/raf-query` still exists as the single skeleton package; release config, `sync-package-docs.ts`, and `.github/DEVELOPMENT.md` all assume it.

## 2026-10-12 — Lint rules (human decided)

- Port the strict oxlint setup into this repo: type-aware oxlint with `correctness` + `suspicious`, React Compiler rules, perfectionist, no-only-tests, vendored `anti-slop` / `anti-slop-effect` / `nkzw` plugins, and generic workspace rules. Plugins live in `tooling/oxlint-plugins` and build with `vp pack`.
- **Enabled everywhere, including README examples in spirit:** `workspace/no-overzealous-destructuring` (destructure only when a field is read ≥3 times), no type assertions (`consistent-type-assertions: never`).
- **Dropped on purpose:** `workspace/no-use-state` (README pattern needs `useOptimistic` / `useActionState`), `eslint/max-params` (3-arg APIs like `useQuery(factory, handle, options)`), `workspace/no-optional` (library options are optional). Also not ported: app-specific rules (Convex, react-hook-form, i18n literals, the old prefetch-handle rules).

## 2026-10-12 — Example apps (human decided)

- `examples/tanstack-start` and `examples/nextjs` build **the same small, representative app**, so the two integrations can be compared side by side.
- UI is shadcn. The components live in one shared private workspace package, **`examples/ui`** (`@examples/ui`), so the example apps contain only routes, query factories, and app-specific components.
- `examples/ui` layout: shadcn components in `src/components/*.tsx`, `src/lib/utils.ts`, `src/hooks/*`, Tailwind v4 `src/styles/globals.css` (no tailwind config). `package.json` `exports`: `./globals.css`, `./components/*`, `./lib/*`, `./hooks/*`. Its `components.json` aliases point at `@examples/ui/...`, so `shadcn add` run there lands in the shared package.
- Each app's `components.json` sets `ui` → `@examples/ui/components` and `utils` → `@examples/ui/lib/utils`, and `tailwind.css` → the shared `globals.css`.
- Set `rsc: true` in `examples/ui/components.json` so interactive components get `"use client"`; Next server components import from the shared package, and TanStack Start ignores the directive.
- `pnpm-workspace.yaml` needs `examples/*` when the first example lands.

App scope, small enough to read in one sitting, covering every README feature:

| Screen / action                                  | Exercises                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Issue list with status filter, sort, page in URL | search params → loader → `prefetch`, `whilePending: "previous"`, `isPrevious` dimming |
| Issue detail                                     | `ensure` (blocking) + keyed Suspense skeleton when switching issues                   |
| Comments under an issue                          | paged `useQuery`, streamed `prefetch`, Load more                                      |
| Assignee card                                    | `useWaterfall` (assignee id only known from the issue)                                |
| Edit title, add comment                          | form Actions + `useOptimistic` + `await qc.invalidate`                                |
| Next.js only: sidebar counts                     | server component `await qc.fetch(...)` with a server-only factory                     |

App: **issue tracker** (confirmed). Data: an in-memory fake DB with artificial latency, shared by both apps so their behavior matches. **`queryFn`s call server functions** — `createServerFn` in TanStack Start, server functions in Next.js — not HTTP route handlers.

## 2026-10-10 — npm release path

- release-it + GitHub Actions: push to `main` → `.github/workflows/release.yaml`.
- Publishes via npm OIDC trusted publishing (`id-token: write`, empty `NODE_AUTH_TOKEN`).
- Needs GitHub secret `ACCESS_TOKEN` (release push) and an npm trusted publisher on `raf-query` for workflow `release.yaml`.
