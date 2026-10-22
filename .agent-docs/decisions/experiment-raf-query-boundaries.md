# Experiment: typed error boundaries in `@raf-query/react` (human asked)

Option C of three competing takes on type-safe error boundaries for render-as-you-fetch on Effect and Effect RPC (A: a new library in `.experimental/effect-query`; B: on effect/reactivity atoms; C: this one, inside the existing packages). A generic failure (auth) is handled high in the tree and narrower ones further down; the compiler refuses a read that leaves a failure unhandled, and a read with nothing left returns plain data.

- **Where it lives:** `@raf-query/react/boundary` (subpath, not the main entry) plus a small core change. The demo is `.experimental/raf-query-boundaries/demo` (port 3012); the docs page is `www/content/typed-error-boundaries.md`, marked experimental.
- **Tuple API (human):** `const [App, useApp] = Boundary.root(...)`, `const [X, useX] = Boundary.catchErrors(parent, { name, errors, fallback })`. Element 0 is the Provider and the handle child boundaries and `X.useResult` / `X.useRun` hang off; element 1 reads plain data. A hook or Provider with its parent's Provider missing above it throws a message naming both.
- **Core keeps the Cause.** A failed first load's `Cause` is kept per rejected promise (`WeakMap`), and `exitThenable(promise)` reads it back as an `Exit`; a rejection with no Cause is a defect. Bindings route on that, not on the thrown value.

Agent decisions:

- **Reads take `(factory, handle)`** like every raf-query read, not a query value. Queries don't declare error schemas: the error type is the factory's Effect error. Boundaries declare `Schema` classes so routing can test values (`Schema.is`).
- **Routing:** `Cause.findError`, then the innermost boundary on the chain the read went through whose schemas match. Defects, interrupts, hydrated failures (no Cause crosses the wire) and failures whose types lied go to the root, whose fallback gets the `Cause`.
- **`useResult` / `useRun` are on element 0** (`Session.useResult(factory, handle)`), not on the hook: React Compiler's lint rejects `useX.useY()`.
- **`run(effect)` / `run.result(effect)`:** writes are checked the same way as reads; `run` throws handled failures to their boundary, `run.result` returns `Result` with what's left. The Effect's services must come from the client (`QueryCache | R`).
- **Retry resets every failed, dataless, unobserved query in the boundary's client**, then renders again. React stops rendering siblings at the first throw, so a boundary can't know which other reads failed; resetting the unshown ones is what makes one click recover them all.
- **Background refetch failures keep their data and don't route**; the demos reset the client on chaos changes instead of invalidating.
- **`useObservedQuery` is `"use no memo"`.** `www` compiles workspace-linked `packages/react/src` with React Compiler, which memoized the cache reads and froze results. The plain `useQuery` had the same latent bug.
- Type-error fixtures (`demo/type-errors/*.tsx`) are checked by `pnpm type-errors --check` against the generated `src/type-errors.gen.json`; knip treats them as entries.
