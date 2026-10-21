---
title: Typed error boundaries (experimental)
description: An experimental render-as-you-fetch cache built only on Effect, whose error boundaries are typed. Catch auth at the top and narrower errors further down; what no boundary catches comes back to the component as a Result, and when nothing is left, as plain data.
section: Experiments
order: 1
---

> [!WARNING]
> This is an experiment, not part of raf-query. `@raf-query/experimental-effect-query` lives in [`.experimental/effect-query`](https://github.com/KATT/raf-query/tree/main/.experimental/effect-query), isn't published, and its API will change. It is one of three designs being compared for typed error boundaries.

A render-as-you-fetch query cache written only in Effect, for apps whose data comes from Effects, such as an [Effect RPC](https://effect.website/docs/v4/api/effect/rpc/RpcClient) client. Every query is an Effect, so every failure has a type, and the cache keeps each query's whole [`Exit`](https://effect.website/docs/v4/api/effect/Exit). [Error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) route on its `Cause`, and the compiler knows which errors each component can still get:

- Catch a generic error (`Unauthorized`) high in the tree and narrower ones (`Forbidden` for one document) further down.
- What no boundary catches comes back to the component as a [`Result`](https://effect.website/docs/v4/data-types/result), and matching it must be exhaustive.
- When the boundaries above a component catch everything, it gets the data itself: there is no error to get.

## Try it

The app below is a small document browser. Its RPC server runs in the page, and the switches break it in different ways. Each dashed outline is a boundary, labeled with what it catches; the one that caught a failure turns solid and shows its fallback.

```demo
effect-query-boundaries
```

- **Sign out**: the session middleware fails every procedure with `Unauthorized`. `Session` catches it, around the list and the page alike.
- **Go offline**: the transport fails with `RpcClientError`, which `Network` catches.
- **No access** on a document: `GetDoc` fails with `Forbidden`. Only `DocAccess`, around the page, catches it, so the list keeps working.
- **Delete** a document, or open the one that doesn't exist: `DocNotFound` has no boundary, so the page gets it back and renders it inline.
- **Server bug**: `GetDoc` dies. A defect isn't in any error type, so it skips every typed boundary and lands on the root.

## The mental model

A chain of boundaries is an Effect pipeline laid over the component tree. The root is [`Effect.provide`](https://effect.website/docs/v4/api/effect/Effect#provide): it mounts the client, the layer every query's services come from. Each boundary below it is [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) for the subtree it wraps, and takes the errors it catches off the type of every read inside it.

A component reads through one boundary, and its query's `Exit` goes where the `Cause` says:

| The query's `Exit`                                          | Where it goes                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A success                                                   | The component                                                                 |
| A typed failure a boundary in the chain catches             | The innermost one whose schemas accept it ([`Schema.is`][is]): its `fallback` |
| A typed failure no boundary in the chain catches            | The component, as the `Result`'s failure                                      |
| A defect, an interrupt, or a client layer that didn't build | The root's `fallback`                                                         |

[is]: https://effect.website/docs/v4/api/effect/Schema#is

The typed failure is [`Cause.findError`](https://effect.website/docs/v4/api/effect/Cause#findError)'s. The chain is the one the component reads through, not whatever happens to be mounted: every hook checks that its boundary is above it, and every boundary checks that its parent is.

## Declare the chain

Each boundary is a pair, like [`useState`](https://react.dev/reference/react/useState)'s. The first element is the Provider you mount, and the handle the next boundary is made from. The second is the hook that reads queries through it:

```sample
effect-query/src/boundaries.tsx#chain
```

`client` is the app's `QueryClient`, built from the layer of the RPC client:

```sample
effect-query/src/client.ts#client
```

A fallback is a component, so it can use hooks. It gets the boundary's own errors as `error`, typed, and a `retry` that refetches the failed queries this boundary caught. The root's fallback gets the whole `cause` instead.

## Queries list their errors

A query is a key, the Effect that loads it, and the schemas of the errors it can fail with, like an RPC procedure's `error`. Retries and timeouts go on the Effect, and its error type follows:

```sample
effect-query/src/queries.ts#queries
```

The schemas are the query's error type, and the Effect must fail with nothing else. A boundary's hook needs them at runtime: it hands back a `Result` or the bare data depending on what the chain leaves, and the types are gone by then.

## Mount it

Mount the Providers in chain order. The root suspends until the client's layer is built, so it goes under a [`Suspense`](https://react.dev/reference/react/Suspense), and so does every read:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#mount
```

`key` on `DocAccess` starts it over when the document changes, so a document you can't open doesn't keep the next one behind its fallback.

## Read through a boundary

A hook suspends until the query's first result, through [`use`](https://react.dev/reference/react/use). Read through `DocAccess`, a document can still fail with `DocNotFound`, the one error no boundary in the chain catches. It comes back as the `Result`'s failure, and [`Match.valueTags`](https://effect.website/docs/v4/api/effect/Match#valueTags) must handle it:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#what-is-left
```

### Nothing left: plain data

`ListDocs` fails with `Unauthorized` or `RpcClientError`, and `Session` and `Network` catch both. Read through `Session`, there is nothing left, so the hook returns the documents themselves, with no `Result` around them:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#nothing-left
```

A boundary that also catches `DocNotFound` does the same for a single document:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#everything
```

## The compiler keeps it exhaustive

These blocks don't compile, and the error under each one is TypeScript's.

### An error left unhandled

While an error is left, the data is behind the `Result`, and reading it as if it weren't is a type error:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#unhandled
```

### A match that misses one

Read through `Session`, `Forbidden` is left as well. A match without a case for it names the missing tag:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#non-exhaustive
```

### A case for an error already caught

Under `DocAccess`, an `Unauthorized` can't reach the component: `Session` caught it. A case for it is a type error, not dead code:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#already-caught
```

### Catching what a parent catches

A boundary inside `Session` that lists `Unauthorized` again would never see one, and the error says which boundary above already catches it:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#catch-twice
```

### An error the query doesn't list

`GetDoc` fails with `DocNotFound`, and the transport with `RpcClientError`. A query that leaves them out of `errors` doesn't type-check:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#undeclared
```

## Mutations

A mutation is an Effect and its errors' schemas, without a key. `Boundary.useRun(boundary)` returns a function that runs one with the client's services, through that boundary:

```sample
effect-query/src/queries.ts#mutation
```

```sample
effect-query/src/docs/effect-query-boundaries.tsx#run
```

The promise resolves with what's left after the chain, narrowed the same way a read is, or with the data when nothing is. A failure a boundary catches goes to that boundary, and the promise never settles.

## Which boundary caught what

`onCaught` on the root is called once for each failure a boundary of its chain renders its fallback for (from [`componentDidCatch`](https://react.dev/reference/react/Component#componentdidcatch)). The demo's event log is built on it:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#on-caught
```

An app that creates its own React root can do the same in [`onCaughtError`](https://react.dev/reference/react-dom/client/createRoot#parameters), where `Boundary.caughtBy` says which boundary caught an error, or `undefined` for anything else:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#caught-by
```

## API reference

### Boundary

| Export                                                     | Use                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Boundary.root({ name, client, fallback, onCaught? })`     | The outermost boundary: `[Provider, hook]`. Mounts `client`, suspends until its layer is built, and catches defects, interrupts, a layer that failed to build and anything thrown while rendering      |
| `Boundary.catchErrors(parent, { name, errors, fallback })` | A boundary inside `parent` that also catches `errors` (schemas, such as `Schema.TaggedError` classes): `[Provider, hook]`. Listing an error a boundary above catches is a type error (`NotYetHandled`) |
| `hook(query)`                                              | Reads a query, suspending until its first result: `Read<A, E, Handled>`. A query whose services the root's client doesn't provide is a type error                                                      |
| `Boundary.useRun(boundary)`                                | `(mutation) => Promise<Read<A, E, Handled>>`. Failures a boundary in the chain catches go there                                                                                                        |
| `Boundary.Read<A, E, Handled>`                             | `A` when `Exclude<E, Handled>` is `never`, else `Result<A, Exclude<E, Handled>>`                                                                                                                       |
| `Boundary.HandledBy<typeof Provider>`                      | The errors a boundary and the ones above it catch                                                                                                                                                      |
| `Boundary.FallbackProps<E>`                                | A boundary's fallback's props: `error` (one of its own errors) and `retry()`                                                                                                                           |
| `Boundary.RootFallbackProps`                               | The root's fallback's props: `cause` and `retry()`, which refetches every failed query                                                                                                                 |
| `Boundary.caughtBy(error)`                                 | For `onCaughtError`: `{ boundary, name, root, error, cause }`, or `undefined`. `onCaught` gets the same                                                                                                |

### Queries and the cache

| Export                                            | Use                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Query.make({ key, effect, errors, staleTime? })` | A query. Its error type is `errors`' schemas; `staleTime` (default `0`) is how long a result stays fresh                         |
| `Mutation.make({ effect, errors })`               | A mutation, for `Boundary.useRun`                                                                                                |
| `QueryClient.make(layer, { gcTime? })`            | The app's services and a cache in one [`ManagedRuntime`](https://effect.website/docs/v4/api/effect/ManagedRuntime)               |
| `QueryClient.runPromise(client, effect)`          | Runs an Effect with the client's services, such as a route loader's prefetch                                                     |
| `QueryCache.prefetch(query)`                      | An Effect that starts the query unless a fresh result is cached or one is in flight                                              |
| `QueryCache.fetch(query)`                         | `prefetch`, then waits for the result, failing with the query's errors                                                           |
| `QueryCache.invalidate(keyPrefix)`                | Marks matching entries stale: read ones refetch and keep their data on screen until the new result arrives, the rest are dropped |

Not there yet: server rendering and hydration, paged queries, and devtools.
