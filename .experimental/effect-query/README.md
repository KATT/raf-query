# Experiment: effect-query, typed error boundaries on an Effect-only cache

A render-as-you-fetch query cache built only on Effect, for apps whose data comes from Effects (an Effect RPC client, say). Because every query is an Effect, every failure has a type, and the cache keeps each query's whole `Exit`. Boundaries route on its `Cause`:

- A chain of boundaries reads like an Effect pipeline laid over the component tree. `Boundary.root` is `Effect.provide`: it mounts the client and catches defects and interrupts. Each `Boundary.catchErrors(parent, …)` below it is `Effect.catchTags` for the subtree it wraps. Generic errors (`Unauthorized`) go near the top, narrower ones (`Forbidden` for one document) further down.
- Each boundary is a pair, like `useState`'s: `const [Session, useSession] = Boundary.catchErrors(App, { name, errors, fallback })`. The first is the Provider you mount (`<App><Session>…</Session></App>`) and the handle the next boundary takes; the second is the hook that reads through it.
- A typed failure goes to the innermost boundary, in the chain the component reads through, whose schemas accept it. What no boundary catches comes back to the component.
- `useSession(query)` returns `Result<A, E minus what the chain catches>`, and when nothing is left, the data itself: no `Result`, so there is no error to get. `Boundary.useRun(Session)` runs mutations with the same narrowing. Handling an error the chain already caught, or catching it twice, is a type error.
- A query (and a mutation) lists its errors' schemas, like an `Rpc` does, and its Effect can fail with nothing else. The hook needs them at runtime: whether to hand back a `Result` or the data depends on what is left, and types are gone by then.

Not published; version stays `0.0.0`. Browser only: no SSR or hydration yet. The docs site's [Typed error boundaries (experimental)](../../www/content/effect-query-boundaries.md) page embeds the live demo and shows the compiler's errors with Twoslash; its code is `www/samples/effect-query`.

| Path       | Package                                | Role                                                                  |
| ---------- | -------------------------------------- | --------------------------------------------------------------------- |
| `package/` | `@raf-query/experimental-effect-query` | Library: `Query`, `Mutation`, `QueryCache`, `QueryClient`, `Boundary` |
| `demo/`    | `@examples/experimental-effect-query`  | Interactive demo, <http://localhost:3010>                             |

```shell
pnpm --filter @raf-query/experimental-effect-query test
pnpm --filter @examples/experimental-effect-query dev
pnpm --filter @examples/experimental-effect-query typecheck   # tsc, then checks the type-error fixtures
pnpm --filter @examples/experimental-effect-query type-errors # rewrites them after a change
```

## The demo

A docs app over an Effect RPC API that runs in the browser (`RpcServer.makeNoSerialization` connected to `RpcClient.makeNoSerialization`). Its boundaries, from the outside in: `App` (defects), `Network` (the transport's `RpcClientError`), `Session` (the session middleware's `Unauthorized`) and `DocAccess` (`Forbidden`). `DocNotFound` and `EmptyTitle` are left to the components.

- **Live**: a chaos panel signs you out, takes the transport offline, locks or deletes documents, and makes the server die. Dashed outlines show which boundary wraps what; the one that caught turns solid. The event log comes from `createRoot`'s `onCaughtError` and `Boundary.caughtBy`.
- **Type errors**: the files in `demo/type-errors/` import the demo's boundaries and queries. Six don't compile (reading data off a `Result` with an error left, a non-exhaustive match, a case for an error already caught, a boundary that re-catches, a query that leaves an error out of its list, a missing service) and one does (nothing left to handle). `scripts/type-errors.ts` runs tsc over them and writes what it said to `src/type-errors.gen.json`, which the tab renders; `typecheck` fails when that file is out of date.

## Making it real

1. Decide between this and the other options (an `effect/reactivity` build, or boundaries inside `@raf-query/react`).
2. Add SSR: dehydrate each entry's `Exit` with the query's schemas, so typed failures survive the trip.
3. Move `package/` to `packages/effect-query` under a public name, give it the published fields and add it to the release.
4. Move the demo to `examples/`, and move the docs page out of the Experiments section.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
