# Package build (agent, human asked)

- Human: minimise bundle size. These are the parts that don't depend on which engine the core runs.
- **Packages build with `tsc -p tsconfig.build.json`**, not `vp pack`. Rolldown compiles `export * as X` to an `__exportAll` getter object that keeps the whole namespace, so `dist/` bundled ~0.4 kB bigger than src. `tsc` keeps it an ESM re-export, as effect's own `dist/` does. `dist/` files are `.js` / `.d.ts`, and `"use client"` directives are kept. Check with `pnpm build && pnpm bundle-size --dist`.
- **`@raf-query/react/tanstack-router` has a `browser` export condition** pointing at a client-only module (`tanstack-router-browser.ts`; shared half in `tanstack-router-shared.ts`). The browser reads the server's stream with a reader loop, so the server's dehydration stream and `Stream.fromReadableStream` stay out of the app (~1 kB).
  - Server runtimes are listed first (`workerd`, `worker`, `node`, `deno`, `bun`), since Cloudflare builds also set `browser`. Router-core's `isServer` export orders them the same way.
  - Lost: a runtime `router.isServer` branch, or router-core's build-time `isServer`, in one module. Neither shook: rolldown keeps the server branch's imports until minification, which can't drop calls whose pure annotations were lost.
- Top-level Effect constructors in core carry `/*#__PURE__*/`, so unused ones shake.
- `tooling/bundle-size/src/analyze.ts` lists one fixture app's modules by size (`node src/analyze.ts [export] [module] [--top N]`).
