# Example apps (human decided)

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
