# Experiment: typed error boundaries on Effect Atom (human asked)

The human asked for a version of the typed error boundary idea "without our whole raf core thing", since Effect Atom already has a cache. `.experimental/atom/package` (`@raf-query/experimental-atom`) is `createErrorBoundary` (raf-query's boundary chain: `[Boundary, useBoundary]`, `claims`, `parent`) plus `useAtomResult(atom, claims)`, on `@effect/atom-react` alone.

- **No per-boundary cache** (agent): raf-query reads return promises, so its boundaries need a stable thenable per read and boundary (`resultThenable(promise, isError, scope)`). Atom's registry holds each atom's `AsyncResult` synchronously, so `useAtomResult` narrows it during render.
- **Built on `useAtomSuspense(atom, { includeFailure: true })`** (agent): suspense and the registry stay Atom's. A failure whose typed error (`Cause.findErrorOption`) a boundary owns is thrown; a defect or an interruption throws `Cause.squash`, as `useAtomSuspense` does; other failures are returned.
- **`reset` refreshes the failed atom** (agent): an Effect atom keeps its `Failure` until refreshed, so rendering the children again would throw again. The hook records the atom and registry against the thrown error (a `WeakMap` keyed by the error) for the boundary to refresh. While refreshing, the failure is `waiting`, and the hook suspends on it instead of throwing it again.
- `effect` and `@effect/atom-react` are peers: a second copy splits `RegistryContext` and Effect's module state.
