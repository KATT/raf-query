# Decisions

Append-only in spirit; rewrite in place when a decision changes. Keep each entry short.

## 2026-10-10 — Repo layout

- Vite+/pnpm workspace, husky, oxlint/oxfmt, release-it, GitHub workflows.
- Publishable packages: `packages/core` (`@raf-query/core`) and `packages/react` (`@raf-query/react`), each a library entry only (`src/index.ts` → `dist/index.mjs`). No `bin`.
- Root scripts fan out with `pnpm -r --filter`: `build` (packages), `build:examples`, `test` (packages, tooling), `typecheck` (examples, packages, tooling). Lint / format / check run once at the root. CI has a Build Examples job.
- Package `exports` point at `./src/index.ts` so workspace consumers (react → core, examples) need no build; `publishConfig.exports` swaps in `./dist/index.mjs`, which `pnpm pack` applies.
- Root `scripts/` holds repo scripts (`sync-package-docs.ts`); root `CHANGELOG.md` is shared by both packages.

## 2026-10-10 — Docs split

- Root `README.md`: product sketch / public story (human will draft ideas there).
- `AGENTS.md`: short environment + pointers agents need every session.
- `.agent-docs/`: durable agent notes (this folder). Agents may reshape it.

## 2026-10-10 — Markdown via oxfmt, not markdownlint

- Oxfmt formats `.md` and embedded JS/TS fences (`embeddedLanguageFormatting: "auto"`).
- Oxlint does **not** lint Markdown (out of scope); do not add markdownlint for parity.
- Keep `fmt` options in sync between `vite.config.ts` and `.oxfmtrc.json` (tabs, width, ignores).
- Workspace disables markdownlint (`markdownlint.enable: false` + unwanted recommendation). Keep `.markdownlint.json` with `MD010: false` as a belt-and-suspenders if the extension is still installed globally.

## 2026-10-12 — Pre-commit lint-fix + `vp lint -c .oxlintrc.json`

- `vp lint` does **not** read `.oxlintrc.json` on its own (it reads `vite.config.ts` `lint`, which is unset). Without `-c .oxlintrc.json` it uses defaults: findings are warnings (exit 0) and `.repos/` isn't ignored. Every `vp lint` invocation (scripts, lint-staged) passes `-c .oxlintrc.json`.
- Pre-commit: husky → `lint-staged --concurrent false`: `vp lint --fix` on JS/TS first, then `vp fmt` on all files, so formatting cleans up after fixes. Unfixable lint errors block the commit.

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
- **`ensure` returns an `EnsuredQueryHandle`** (`ensured: true` at runtime, so it survives serialization), and `useQuery` returns `[data, controls]` for it via `use()` inside the hook, which still suspends if the entry lost its data (gc while the router kept loader data, `reset`). `QueryHandle` has `ensured?: false`, so the two aren't assignable to each other: a prop typed for one can't receive the other, so the runtime shape always matches the type (human asked, 2026-10-12).
- **Pending-input behavior is `whilePending: "suspend" | "previous"`**, with `isPrevious` in controls, instead of TanStack's `placeholderData: keepPreviousData` + `isPlaceholderData`. `"suspend"` relies on both routers committing navigations in `startTransition` (TanStack Router: `link.ts` "All navigations now use startTransition under the hood"; `Transitioner.tsx`). Skeleton-on-change is a keyed Suspense (`key={state.hash}`), not a third mode — a hook can't force an already-revealed boundary back to its fallback inside a transition.
- **No refetch on mount.** Loaders, invalidation, focus/reconnect-while-stale, `refetch()`, `refetchInterval` are the only refetch triggers.
- **Server-only factories** (importing DB code) can't be read by client hooks; pass a plain promise prop or render in RSC. (An earlier proposal for a `server: true` flag didn't work: the client component would still have to import the factory.)
- **Effect is a runtime dependency of both libraries** (human, 2026-10-12). Use it for subscriptions, dedupe, scheduling, retries — functionally like TanStack Query, not a line-by-line port. Public API is Promise-first **and** exposes Effect-native entry points (e.g. Effect-returning `queryFn`, Stream-based subscriptions). Versions come from the `catalog:` in `pnpm-workspace.yaml`; source is vendored at `.repos/effect` — read it (start with its `LLMS.md`) before writing Effect code.

## 2026-10-12 — Two packages, React-agnostic core

- `@raf-query/core` (framework-agnostic, mirrors `@tanstack/query-core`) and `@raf-query/react` (bindings, re-exports core — apps install only this).
- Framework integrations are subpath exports of `@raf-query/react` (`/tanstack-router`, `/rsc`, `/next`), not separate packages.
- **Lockstep versions:** both packages always share a version and release together.
- `@raf-query/react` depends on `@raf-query/core` via `workspace:*`, which `pnpm pack` publishes as the exact lockstep version. `react` is a peer (`^19.2.0`). Both depend on `effect` through the catalog, which is a caret range (`^4.0.1`) because `pnpm pack` publishes the catalog value as-is and an exact pin would duplicate Effect in apps.

## 2026-10-12 — Lint rules (human decided)

- Port the strict oxlint setup into this repo: type-aware oxlint with `correctness` + `suspicious`, React Compiler rules, perfectionist, no-only-tests, vendored `anti-slop` / `anti-slop-effect` / `nkzw` plugins, and generic workspace rules. Plugins live in `tooling/oxlint-plugins` and build with `vp pack`.
- **Enabled everywhere, including README examples in spirit:** `workspace/no-overzealous-destructuring` (destructure only when a field is read ≥3 times), no type assertions (`consistent-type-assertions: never`).
- **Dropped on purpose:** `workspace/no-use-state` (README pattern needs `useOptimistic` / `useActionState`), `eslint/max-params` (3-arg APIs like `useQuery(factory, handle, options)`), `workspace/no-optional` (library options are optional). Also not ported: app-specific rules (Convex, react-hook-form, i18n literals, the old prefetch-handle rules).

## 2026-10-12 — Example apps (human decided)

- `examples/tanstack-start` and `examples/nextjs` build **the same small, representative app**, so the two integrations can be compared side by side.
- UI is shadcn. The components live in one shared private workspace package, **`examples/.shared/ui`** (`@examples/ui`), so the example apps contain only routes, query factories, and app-specific components.
- `examples/.shared/ui` layout: shadcn components in `src/components/*.tsx`, `src/lib/utils.ts`, `src/hooks/*`, Tailwind v4 `src/styles/globals.css` (no tailwind config). `package.json` `exports`: `./globals.css`, `./components/*`, `./lib/*`, `./hooks/*`. Its `components.json` aliases point at `@examples/ui/...`, so `shadcn add` run there lands in the shared package.
- **The apps' shared packages live in `examples/.shared/`** (human): `db` and `ui`, so `examples/` lists only apps (plus `.experimental/`). Like `.experimental/`, it's listed separately in `pnpm-workspace.yaml`, the root `typecheck` filter, and the oxlint overrides, because `examples/*` globs don't reach it. Package names stay `@examples/db` / `@examples/ui`.
- Each app's `components.json` sets `ui` → `@examples/ui/components` and `utils` → `@examples/ui/lib/utils`, and `tailwind.css` → the shared `globals.css`.
- Set `rsc: true` in `examples/.shared/ui/components.json` so interactive components get `"use client"`; Next server components import from the shared package, and TanStack Start ignores the directive.

App scope, small enough to read in one sitting, covering every README feature:

| Screen / action                                  | Exercises                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Issue list with status filter, sort, page in URL | search params → loader → `prefetch`, `whilePending: "previous"`, `isPrevious` dimming |
| Issue detail                                     | `ensure` (blocking) + keyed Suspense skeleton when switching issues                   |
| Comments under an issue                          | paged `useQuery`, streamed `prefetch`, Load more                                      |
| Assignee card                                    | Start: `useWaterfall`. Next.js: `await qc.fetch` the issue, then `prefetch` the user  |
| Edit title, add comment                          | form Actions + `useOptimistic` + `await qc.invalidate`                                |

App: **issue tracker** (confirmed). Data: an in-memory fake DB with artificial latency, shared by both apps so their behavior matches. **`queryFn`s call server functions** — `createServerFn` in TanStack Start, server functions in Next.js — not HTTP route handlers.

## 2026-10-12 — How the examples are built (agent)

- **`examples/.shared/db`** (`@examples/db`) is the fake DB; **`@examples/db/types`** is its client-safe half (Zod schemas, interfaces, `currentUser`). Client code imports only `/types`; the root entry reads `process.env` and the store on `globalThis`, which must stay out of client bundles.
- **No Effect in the example apps or `@examples/db`** (human, 2026-10-12): they show raf-query to people who don't use Effect. When they need a schema library, use **Zod**. Effect stays in the libraries.
- Inputs are **Zod schemas** in `/types`. Start validators and `validateSearch` take the schema directly (Zod implements Standard Schema); Next server actions call `schema.parse(input)` (they're public endpoints, so they validate even though the parameter is typed). Next pages parse `searchParams` with `IssueListSearchParams` (strings → `IssueListInput`).
- **Next.js rejects server actions during SSR** ("Server Functions cannot be called during initial render"). So no `useWaterfall` with a server-action `queryFn` in the Next app: the issue page `await`s the issue, then `prefetch`es its assignee. Comments embed their `author` (backend returns it with the parent) in both apps, so there's no per-comment lookup.
- Comments list newest first, with the form on top: a new comment must land on the loaded first page, or it vanishes when the optimistic entry settles.
- **The client picks a new comment's id** (`crypto.randomUUID()`, sent in `AddCommentInput`). The `invalidate` refetch lands while the action is still pending, so `useOptimistic` re-applies its update on top of data that already holds the saved comment. The reducer skips ids already present, and the shared id keeps one React key, so there's no flash of two entries. Use the same pattern for any optimistic insert.
- Start: `vite` is overridden to `@voidzero-dev/vite-plus-core` (no `vite` bin), so scripts are `vp build` / `vp dev` / `vp preview`. React Compiler runs via `@rolldown/plugin-babel` + `reactCompilerPreset()`. **Don't name a source file `server.ts`**: it becomes `dist/server/server.js` and replaces the server entry (500 `serverBuild.fetch` undefined).
- `routeTree.gen.ts` is regenerated on every Start build in its own style, so oxfmt and oxlint both ignore it. Next: `reactCompiler: true`, `transpilePackages` for the workspace packages (their `exports` point at `.ts` source).

## 2026-10-12 — Library internals (agent)

- `.oxlintrc.json` turns off `anti-slop/no-unknown-parameters`, `no-unknown-returns`, `no-unsafe-dictionary-type` for `packages/*/src/**`: the cache is type-erased on purpose and factory generics restore types at the public boundary. Each remaining cast has a `SAFETY:` comment and an oxlint disable. Where a value must be widened before the cast, use the package's `unsafeCast<T>(value: unknown)` (`cast.ts`, not exported): `anti-slop/no-widen-then-assert` bans the inline `const x: unknown = …; x as T` form.
- The TanStack Router integration stores its payload under the `raf` key of the router's dehydrated state (`{ raf: { initial, stream } }`).
- The `"failed"` `CacheEvent` exists for integrations (redirect handling) and fires after retries.
- **Structural sharing** (`share.ts`, a port of TanStack's `replaceEqualDeep`) runs in `QueryEntry.#succeed`, so fetch results, `setData` and hydration all share. Equal data keeps the old promise too, so readers see no change. Option is `structuralSharing: boolean` only; TanStack's function form wasn't needed yet.
- React tests: render, rerender and click inside **async** `act` (`await act(async () => …)`); a sync `act` never resumes a suspended tree after its promise resolves. Responding to a fake request needs a macrotask wait inside the act. Effect tests that fork a stream before a cache write need `Effect.forkChild(x, { startImmediately: true })`.

## 2026-10-12 — Devtools (agent)

- Ship as subpath `@raf-query/react/devtools` (like the integrations), not a separate package. Hand-written React + inline styles: no CSS file, no extra dependency, no Solid core like `@tanstack/query-devtools`.
- Mirrors `@tanstack/react-query-devtools` (`.repos/query/packages/react-query-devtools/src/index.ts`): the default entry swaps in `() => null` when `process.env.NODE_ENV === "production"` so bundlers drop the panel; `/devtools/production` always renders it. We check `=== "production"` (TanStack: `!== "development"`) so tests and dev both get the panel. Verified by grepping both example apps' production builds for a panel-only string. TS 7 doesn't auto-include `@types/node`, so `devtools.tsx` declares `process` locally.
- Renders nothing until hydrated (`useSyncExternalStore` server snapshot `false`): the server's cache isn't the browser's, and `localStorage` state is read in the client-only child's `useState` initializer.
- Cache events fire synchronously, sometimes during another component's render, so `devtools-store.ts` notifies React in a microtask and caches the row snapshot per event version.
- Core gained what the panel needs: `Query.observerCount`, `Query.isStaleNow()`, `Query.reset()`, `qc.reset` / `qc.remove`, and the `observers` cache event (subscribe/unsubscribe don't otherwise emit). A suspended reader isn't counted until it commits.

## 2026-10-12 — Experiment: `@raf-query/experimental-tanstack-react-query` (human asked)

One package (`packages/.experimental/tanstack-react-query`) giving raf-query's API on TanStack Query, to compare against the own-engine pair. Human picks: keep core/react for now; `@tanstack/react-query` is a regular `dependency` and the only one (no Effect); the cache is TanStack's own `QueryClient`, so TanStack hooks and devtools work on it; same API as the README minus Effect entry points; private, with experimental copies of both example apps (`examples/.experimental/tanstack-query-start` on port 3002, `examples/.experimental/tanstack-query-nextjs` on port 3003).

- **Experiments live in `.experimental/` folders** (human): `packages/.experimental/*` and `examples/.experimental/*`, listed separately in `pnpm-workspace.yaml` and the root `build` / `build:examples` / `test` / `typecheck` filters. Path globs like `./packages/*` (pnpm filters, `.release-it.json`'s `after:bump`) and `packages/*/src/**` (oxlint overrides) don't reach them, so each place that should include them names `.experimental/*` explicitly. Package names keep the `experimental-` prefix (`@raf-query/experimental-tanstack-react-query`, `@examples/experimental-tanstack-query-*`), so imports say it too. Its `package.json` has no publish-only fields (`files`, `publishConfig`, npm metadata); `exports` point at `src/`.

Agent decisions:

- **Verbs are free functions** taking the client first — `prefetch(qc, factory, input)`, `ensure`, `ensureData`, `invalidate`, `setData`, `getData` — since the client is TanStack's class. `qc.fetch` became `ensureData` (`fetch` shadows the global). Prefix invalidation is TanStack's own `qc.invalidateQueries({ queryKey })`. TanStack's hooks are not re-exported.
- Verbs call `client.query()` / `client.infiniteQuery()` (the non-deprecated API). Those default `retry` to `false`, so verbs pass the read default instead: 0 on the server, 3 in the browser, unless the factory or client sets one.
- **One observer per query hash**, recreated when the hash changes. Moving a `QueryObserver` to a new key refetches stale data (`shouldFetchOptionally`), which would refetch what the loader just fetched. Observers set `refetchOnMount: false`.
- **Stable thenables** live in `thenable.ts`, one set per `Query` in a `WeakMap`: a fulfilled thenable per data identity, and one pending thenable fed by `QueryCache.subscribe`. A read with no data and nothing in flight starts the fetch during render (`observer.fetchOptimistic`), because `use()` suspends before effects run.
- **An error is shown once, then the next read retries.** React re-renders a throwing tree once before the error boundary takes it, so the rejected thenable is returned until a microtask passes; after that, a read (an error boundary reset) refetches. This replaces TanStack's `retryOnMount`.
- Paged factories use `InfiniteQueryObserver`; `{ pages }` maps to `client.infiniteQuery({ pages })`.
- Dev-only check: two inputs with the same key hash warn once per key (`console.warn`).
- Integrations: TanStack Router uses TanStack's own `@tanstack/react-router-ssr-query` (no `/tanstack-router` subpath). `/rsc` exports a `HydrationBoundary` that dehydrates pending entries as promises and skips entries an earlier boundary already sent in the request; `/next` exports `QueryProvider` (client per server render, singleton in the browser).
- Not released: `.release-it.json` publishes core and react by name only, and its `after:bump` filter (`./packages/*`) doesn't reach `.experimental/`, so the version stays `0.0.0`.
- Tests: TanStack batches observer notifications on a `setTimeout(0)`, so React tests wait a macrotask inside `act` after any cache write (`flush()` in `test-utils.tsx`).

## 2026-10-12 — npm release path

- release-it + GitHub Actions: push to `main` → `.github/workflows/release.yaml`, run from the repo root (`.release-it.json`). Setup steps live in `.github/DEVELOPMENT.md`.
- `npm: false` in release-it: the **latest git tag is the version source**; an `after:bump` hook writes the version into every `packages/*/package.json` (not `packages/.experimental/*`).
- **Publish before git**: `before:git:release` builds and publishes core then react, so a failed publish pushes no commit or tag. (The first release attempt pushed `chore: release v0.0.1` + tag `0.0.1` and then failed at `npm publish` — that's why; the tag was deleted.)
- 0.0.1 was published by hand to bootstrap trusted publishing, then tagged at that commit (GitHub Release created by hand) so CI found nothing to release. npm added a `0.0.0-stage` stub version to each package on creation; it's npm-managed and left alone.
- `npm publish` from an agent shell fails with `EOTP` (2FA web auth needs an interactive terminal); manual publishes have to be run by the user.
- Publishes via npm OIDC trusted publishing (`id-token: write`, empty `NODE_AUTH_TOKEN`). npm only allows a trusted publisher on a package that exists, so every new package needs one manual first publish (with `--provenance=false`) before `npm trust github`.
- Locally, nested `pnpm` calls from `pnpm -r` scripts hit the broken corepack shim described in `AGENTS.md`; put the cached pnpm binary first on `PATH` (a symlink named `pnpm`) when running root scripts.
