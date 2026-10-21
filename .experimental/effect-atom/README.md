# Experiment: effect-atom, typed error boundaries over `effect/reactivity` atoms

Typed React error boundaries for data that comes from `effect/reactivity` atoms (`Atom`, `AtomRpc`), read through `@effect/atom-react`'s registry. An atom's `AsyncResult` keeps its failure's whole `Cause`, so every failure has a type, and boundaries route on it:

- A chain of boundaries reads like an Effect pipeline laid over the component tree. Each atom's runtime (`Atom.runtime(layer)`, `AtomRpc.Service`'s `.runtime`) is the `Effect.provide`, so the chain needs no client. `Boundary.root` catches defects and interrupts. Each `Boundary.catchErrors(parent, …)` below it is `Effect.catchTags` for the subtree it wraps. Generic errors (`Unauthorized`) go near the top, narrower ones (`Forbidden` for one document) further down.
- Each boundary is a pair, like `useState`'s: `const [Session, useSession] = Boundary.catchErrors(App, { name, errors, fallback })`. The first is the Provider you mount (`<App><Session>…</Session></App>`) and the handle the next boundary takes; the second is the hook that reads through it.
- A typed failure goes to the innermost boundary, in the chain the component reads through, whose schemas accept it. What no boundary catches comes back to the component.
- `useSession(atom)` returns `A | Unhandled<E minus what the chain catches>`, and when nothing is left, `A` itself: there is no error to get. `Boundary.isUnhandled` tells them apart. `Boundary.useSet(Session, fnAtom)` writes to a function atom with the same narrowing. Handling an error the chain already caught, or catching it twice, is a type error.
- Atoms keep what they give you: one atom per key with `Atom.family`, shared by every reader; refresh by `Reactivity` key; dropped after their idle time.

Not published; version stays `0.0.0`. Browser only: no SSR or hydration yet. The docs site's [Typed error boundaries over atoms](../../www/content/effect-atom-boundaries.md) page, in its Experiments section, embeds the live demo and shows the compiler's errors with Twoslash; its code is in `www/samples/tanstack-start-effect/src/docs/effect-atom-boundaries*.tsx`.

| Path       | Package                               | Role                                                        |
| ---------- | ------------------------------------- | ----------------------------------------------------------- |
| `package/` | `@raf-query/experimental-effect-atom` | Library: `Boundary`                                         |
| `demo/`    | `@examples/experimental-effect-atom`  | Interactive demo, <http://localhost:3011>; `./live` for www |

```shell
pnpm --filter @raf-query/experimental-effect-atom test
pnpm --filter @examples/experimental-effect-atom dev
pnpm --filter @examples/experimental-effect-atom typecheck   # tsc, then checks the type-error fixtures
pnpm --filter @examples/experimental-effect-atom type-errors # rewrites them after a change
```

## The demo

A docs app over an Effect RPC API that runs in the browser (`RpcServer.makeNoSerialization` connected to `RpcClient.makeNoSerialization`), read through an `AtomRpc.Service` (`DocsClient`). Its boundaries, from the outside in: `App` (defects), `Network` (the transport's `RpcClientError`), `Session` (the session middleware's `Unauthorized`) and `DocAccess` (`Forbidden`). `DocNotFound` and `EmptyTitle` are left to the components.

- **Live**: a chaos panel signs you out, takes the transport offline, locks or deletes documents, and makes the server die; each change invalidates the `"docs"` reactivity key, so what's on screen refreshes. Dashed outlines show which boundary wraps what; the one that caught turns solid. The event log comes from the root's `onCaught`.
- **Type errors**: the files in `demo/type-errors/` import the demo's boundaries and atoms. Six don't compile (reading data before ruling out an `Unhandled`, a non-exhaustive match, a case for an error already caught, a boundary that re-catches, an atom needing a service its runtime lacks, a write's result read like data) and one does (nothing left to handle). `scripts/type-errors.ts` runs tsc over them and writes what it said to `src/type-errors.gen.json`, which the tab renders; `typecheck` fails when that file is out of date.

## Making it real

1. Decide between this and the other options (an Effect-only query cache, or boundaries inside `@raf-query/react`).
2. Add SSR: dehydrate atoms' results (`@effect/atom-react`'s `HydrationBoundary`) with their errors' schemas, so typed failures survive the trip.
3. Move `package/` to `packages/` under a public name, give it the published fields and add it to the release.
4. Move the demo to `examples/`, and move the docs page out of the Experiments section.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
