# Experiment: effect-query, typed error boundaries on an Effect-only cache (human asked, agent designed)

- Human: a raf-query-like library built only on Effect / Effect RPC, with type-safe error boundaries inspired by result-rpc (catch a generic error such as auth higher up, narrower ones further down), more Effect-native; competing options as separate PRs with interactive demos that show exhaustive errors, type errors for unhandled ones, and that a fully handled chain can't produce an error.
- Lives in `.experimental/effect-query/` (`package/`, `demo/` on port 3010). Effect's own `useAtomSuspense` throws `Cause.squash` to an untyped boundary, so there was nothing to reuse.

Agent decisions:

- **The cache keeps each query's `Exit`**, so a failure keeps its whole `Cause`. Routing reads it: `Cause.findError` finds a typed failure, which goes to the innermost boundary in the chain whose schemas accept it (`Schema.is`), or back to the component. A cause without one (defects, interrupts) goes to the root. Matching uses schemas, not just `_tag`.
- **Boundaries are a chain of values**, built with `Boundary.root({ client })` then `.catchErrors({ errors: [Schema classes] })`, and the hooks are methods on them. The types come from the chain a component reads through, so they are only true if it is mounted above: every hook checks its boundary's Provider is above it, and every Provider checks its parent's. Routing follows the chain read through, not what happens to be mounted.
- `use` only compiles when the chain catches every error (`Exhausted` adds a property naming the tags left, so the error says which). `useResult` returns `Result<A, Exclude<E, Handled>>`. `useRun` returns uncaught failures and sends caught ones to their boundary (the promise never settles). `catchErrors` rejects errors a boundary above catches (`NotYetHandled`). A query's services must be the root client's.
- `.catchErrors`, not `.catch` (the lint reads `.catch(` as a promise chain). `Effect.flatMap(Service, …)`, not `Service.use(…)` (rules-of-hooks reads `.use`).
- Queries have no retry or timeout options: write them on the Effect, and the error type follows. Only `staleTime` is the cache's.
- Requests run with the cache's services under the latest reader's, so a test's `TestClock` reaches them.
- Listeners are kept by hash, apart from entries, so a hook subscribes by `query.hash` and needs no memoized query.
- The snapshot promise records its `status` like React's thenables, so readers call `use()` on every render (skipping it once settled made React warn).
- `Boundary.caughtBy(error)` is for `onCaughtError`: it says which boundary caught what.
- The demo's "Type errors" tab is generated: `scripts/type-errors.ts` runs tsc over `type-errors/*.tsx` (`.fails.tsx` must fail, `.compiles.tsx` must pass), and `typecheck` runs it with `--check`.
- Lost, for now: SSR and hydration (typed failures would need the query's schemas to cross the wire); paged queries; devtools.
