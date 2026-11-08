# Effect only in tooling, never in published packages (human decided)

- `@raf-query/core`, `@raf-query/react` and `@raf-query/boundary` don't depend on Effect, and neither do the example apps. Apps install one package and write promises.
- Effect stays where it pays for itself: `scripts/`, `tooling/`, the `www` build, CI and deploy steps. There, files, processes, HTTP and env go through Effect's services, provided by `NodeServices.layer` at the edge.
- Why: Effect in the runtime costs every app its bundle size and a second mental model, for features (typed errors, services, streams) that plain data and async iterables cover.
- Lost: an engine written in Effect, Effect `queryFn`s and `Schedule` retries, an Effect API on `@raf-query/core`, and a TanStack Start + Effect RPC example.
- Where: `AGENTS.md` (Code), `.github/DEVELOPMENT.md`, `pnpm-workspace.yaml` (the `effect` catalog entry is for tooling).
