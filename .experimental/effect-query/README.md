# Experiment: effect-query, typed error boundaries on an Effect-only cache

A render-as-you-fetch query cache built only on Effect, for apps whose data comes from Effects (an Effect RPC client, say). Because every query is an Effect, every failure has a type, and the cache keeps each query's whole `Exit`. Boundaries route on its `Cause`:

- A chain of boundaries reads like an Effect pipeline laid over the component tree. `Boundary.root` is `Effect.provide`: it mounts the client and catches defects and interrupts. Each `Boundary.catchErrors(parent, …)` below it is `Effect.catchTags` for the subtree it wraps. Generic errors (`Unauthorized`) go near the top, narrower ones (`Forbidden` for one document) further down.
- The root declares, as a type, what its queries can fail with: `Boundary.root({ name, client, errors: Boundary.errors<AppError>(), fallback })`, where `type AppError = Boundary.RpcErrors<typeof DocRpcs>`. Boundaries catch by `_tag`, checked against it: `Boundary.catchErrors(App, { name, tags: ["Unauthorized"], fallback })`. A tag the errors don't have, one a boundary above already catches, or one two of the errors share, is a type error. The modules that declare boundaries and read through them import errors with `import type` only.
- Each boundary is a pair: `const [Session, useSession] = Boundary.catchErrors(…)`. The first is the Provider you mount (`<App><Session>…</Session></App>`) and the handle the next boundary takes. `useSession(query)` returns `A | Unhandled<E minus the tags the chain catches>`, or just `A` when nothing is left; `Boundary.isUnhandled(doc)` narrows it, and `doc.error` is what's left. `Boundary.useRun(Session)` runs mutations and resolves with the same.
- A typed failure goes to the innermost boundary, in the chain the component reads through, that lists its `_tag`. What no boundary catches comes back to the component as an `Unhandled`; a defect or an interrupt goes to the root.
- A query's (and a mutation's) errors are its Effect's: `Query.make({ key, effect })` lists nothing.

Matching by tag trusts `_tag` at runtime. An Effect RPC client's failures are instances its schemas decoded, so they carry the tags their types say; an Effect written by hand can lie with a cast (its failure then comes back as an `Unhandled` where the type says data), so validate where it's built. The RPC client still ships the group's schemas: `import type` keeps the error classes out of the boundary and component modules, not out of the bundle.

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
- **Type errors**: the files in `demo/type-errors/` import the demo's boundaries and queries. Six don't compile (reading the data without checking `isUnhandled`, a non-exhaustive match, a case for an error already caught, a boundary that re-catches, a misspelled tag, a missing service) and one does (nothing left to handle). `scripts/type-errors.ts` runs tsc over them and writes what it said to `src/type-errors.gen.json`, which the tab renders; `typecheck` fails when that file is out of date.

## Making it real

1. Decide between this and the other options (an `effect/reactivity` build, or boundaries inside `@raf-query/react`).
2. Add SSR: dehydrate each entry's `Exit` with the RPC group's schemas, so typed failures survive the trip as instances.
3. Move `package/` to `packages/effect-query` under a public name, give it the published fields and add it to the release.
4. Move the demo to `examples/`, and move the docs page out of the Experiments section.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
