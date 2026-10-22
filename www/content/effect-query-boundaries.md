---
title: Typed error boundaries (experimental)
description: An experimental render-as-you-fetch cache built only on Effect, whose error boundaries are typed. Catch auth at the top and narrower errors further down; what no boundary catches comes back to the component as an Unhandled, and when nothing is left, the read is plain data.
section: Experiments
order: 1
---

> [!WARNING]
> This is an experiment, not part of raf-query. `@raf-query/experimental-effect-query` lives in [`.experimental/effect-query`](https://github.com/KATT/raf-query/tree/main/.experimental/effect-query), isn't published, and its API will change. It is one of three designs being compared for typed error boundaries.

A render-as-you-fetch query cache written only in Effect, for apps whose data comes from Effects, such as an [Effect RPC](https://effect.website/docs/v4/api/effect/rpc/RpcClient) client. Every query is an Effect, so every failure has a type, and the cache keeps each query's whole [`Exit`](https://effect.website/docs/v4/api/effect/Exit). [Error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) route on its `Cause`, and the compiler knows which errors each component can still get:

- Catch a generic error (`Unauthorized`) high in the tree and narrower ones (`Forbidden` for one document) further down.
- What no boundary catches comes back to the component as an `Unhandled`, which it must check for before it reads the data, and matching its error must be exhaustive.
- When the boundaries above a component catch everything, it gets the data itself: there is nothing to check.

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

### Change the types

The **Types** switches change which tags each boundary catches, and how `DocPage` reads what it gets. Each combination is a file in this page's sample app, shown under the demo. TypeScript compiled all of them when the site was built: the squiggles, the errors under their lines and the types under each `// ^?` are what it reported. The app remounts with that chain and runs it with its types erased, so a combination that doesn't compile shows what the compiler is stopping:

- Turn off **Session catches Unauthorized**: both reads have `Unauthorized` left. `DocList` maps over what it read without checking, so `.map` is an error, and `DocPage`'s match has a case missing. Sign out, and `DocList` gets an `Unhandled`: `.map` throws, and the root catches it as a defect.
- Turn on **DocAccess also catches Unauthorized**: `Session` already does, and the error on `tags` says so.
- Turn off **DocPage matches DocNotFound**: the match has a case missing. Open the doc that doesn't exist, and `Match.valueTags` throws.
- Turn on **DocPage skips isUnhandled**: `DocPage` reads `doc.title` straight away, and with `DocNotFound` left, `title` isn't on its type. Open the doc that doesn't exist, and the page renders blank: an `Unhandled` has no title.
- Turn on **DocAccess also catches DocNotFound**: there is nothing left to match, so the match's case is an error. Turn on **DocPage skips isUnhandled** as well, and it compiles: `DocPage` gets the document itself.

## The mental model

A chain of boundaries is an Effect pipeline laid over the component tree. The root is [`Effect.provide`](https://effect.website/docs/v4/api/effect/Effect#provide): it mounts the client, the layer every query's services come from, and declares the errors its boundaries may catch. Each boundary below it is [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) for the subtree it wraps, and takes the errors it catches off the type of every read inside it.

A component reads through one boundary, and its query's `Exit` goes where the `Cause` says:

| The query's `Exit`                                          | Where it goes                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| A success                                                   | The component                                                            |
| A typed failure a boundary in the chain catches             | The innermost one whose `tags` list the failure's `_tag`: its `fallback` |
| A typed failure no boundary in the chain catches            | The component, as an `Unhandled`                                         |
| A defect, an interrupt, or a client layer that didn't build | The root's `fallback`                                                    |

The typed failure is [`Cause.findError`](https://effect.website/docs/v4/api/effect/Cause#findError)'s. The chain is the one the component reads through, not whatever happens to be mounted: every hook checks that its boundary is above it, and every boundary checks that its parent is.

## Declare the chain

Each boundary is a pair, destructured like [`useState`](https://react.dev/reference/react/useState)'s. The first element is the Provider you mount, and the handle the next boundary is made from. The second is the hook that reads a query through it:

```sample
effect-query/src/boundaries.tsx#chain
```

The root's `errors` is a type, not a value: `Boundary.errors<AppError>()` declares every error its boundaries may catch, and `Boundary.RpcErrors` collects them from an RPC group, its procedures' errors, its middleware's and the transport's `RpcClientError`. Each boundary below lists the `_tag`s it catches, and its fallback's `error` is the errors with those tags. `client` is the app's `QueryClient`, built from the layer of the RPC client:

```sample
effect-query/src/client.ts#client
```

A fallback is a component, so it can use hooks. It gets the boundary's own errors as `error`, typed, and a `retry` that refetches the failed queries this boundary caught. The root's fallback gets the whole `cause` instead.

## A query's errors are its Effect's

A query is a key and the Effect that loads it. Its error type is the Effect's, so retries and timeouts go on the Effect, and the type follows:

```sample
effect-query/src/queries.ts#queries
```

The boundaries catch by `_tag` at runtime, so a query lists no schemas, and the modules that declare boundaries and read through them import their errors as types only.

## Mount it

Mount the Providers in chain order. The root suspends until the client's layer is built, so it goes under a [`Suspense`](https://react.dev/reference/react/Suspense), and so does every read:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#mount
```

`key` on `DocAccess` starts it over when the document changes, so a document you can't open doesn't keep the next one behind its fallback.

## Read through a boundary

A boundary's hook suspends until the query's first result, through [`use`](https://react.dev/reference/react/use). Read through `DocAccess`, a document can still fail with `DocNotFound`, the one error no boundary in the chain catches. The hook hands it back as an `Unhandled`, so it returns `Doc | Unhandled<DocNotFound>`. `Boundary.isUnhandled` tells the two apart, and [`Match.valueTags`](https://effect.website/docs/v4/api/effect/Match#valueTags) must handle the `Unhandled`'s `error`; its `cause` is the whole `Cause`:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#what-is-left
```

### Nothing left: plain data

`ListDocs` fails with `Unauthorized` or `RpcClientError`, and `Session` and `Network` catch both. Read through `Session`, there is nothing left, so its hook returns the documents themselves, with no `Unhandled` to check for:

```sample
effect-query/src/docs/effect-query-boundaries.tsx#nothing-left
```

A boundary that also catches `DocNotFound` does the same for a single document:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#everything
```

## The compiler keeps it exhaustive

These blocks don't compile, and the error under each one is TypeScript's. [Change the types](#change-the-types) in the demo to see the same errors on a chain you put together.

### An error left unhandled

While an error is left, the read may be an `Unhandled`, so the data's fields aren't on its type until `Boundary.isUnhandled` rules it out. The error names what's left:

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

Each tag has one place in a chain. A boundary inside `Session` that lists `Unauthorized` again names the tag a boundary above already catches:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#catch-twice
```

### A tag the root doesn't declare

`tags` takes only the tags of the root's `errors`, so a typo doesn't type-check:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#typo
```

### Two errors with one tag

At runtime a boundary only sees a `_tag`. When the root's errors have two types with the same tag, a boundary that catches it couldn't tell which one its fallback got, so listing it is a type error:

```sample
effect-query/src/docs/effect-query-boundaries.errors.tsx#shared-tag
```

## Tags, not schemas

A boundary matches a failure by its `_tag`, against the tags it lists. The error classes stay where they're defined, and the modules that declare boundaries and read through them need only their types. This page's sample and demo import them with `import type` alone: their `boundaries.tsx`, `queries.ts` and components import nothing at runtime from the module that defines the RPC group and its errors. What that relies on:

- **Each tag names one type.** Matching by tag is only as good as the tags: the compiler rejects a boundary whose tag more than one of the root's errors carries ([Two errors with one tag](#two-errors-with-one-tag)), and a tag that isn't one of them.
- **The failure is what its type says.** The RPC client decodes each failure with its procedure's schemas, so what reaches a boundary is an instance of the declared error. An Effect you write yourself can claim an error type it doesn't fail with, through a cast: its boundary would render a fallback whose `error` isn't what its props say, or a read whose type is the data alone would return an `Unhandled`. Decode untrusted values with [`Schema`](https://effect.website/docs/v4/api/effect/Schema) where the Effect is built, not in the boundary.
- **The schemas still ship.** The RPC client decodes with them, so the client bundle includes them either way. Only the boundaries and the components that read through them don't import them.

## Mutations

A mutation is an Effect, without a key. `Boundary.useRun(boundary)` returns a function that runs one with the client's services, through that boundary:

```sample
effect-query/src/queries.ts#mutation
```

```sample
effect-query/src/docs/effect-query-boundaries.tsx#run
```

The promise resolves the way a read returns: with the mutation's value, or an `Unhandled` of what's left after the chain, and with the value alone when nothing is. A failure a boundary catches goes to that boundary, and the promise never settles.

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

| Export                                                          | Use                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Boundary.root({ name, client, errors?, fallback, onCaught? })` | The outermost boundary: `[Provider, useX]`. Mounts `client`, suspends until its layer is built, and catches defects, interrupts, a layer that failed to build, and anything else thrown while rendering                                                                               |
| `Boundary.errors<E>()`                                          | The root's `errors`: declares, as a type only, every error its boundaries may catch                                                                                                                                                                                                   |
| `Boundary.RpcErrors<typeof Rpcs>`                               | What a call of an RPC group's client can fail with: each procedure's error, its middleware's, and `RpcClientError`                                                                                                                                                                    |
| `Boundary.catchErrors(parent, { name, tags, fallback })`        | A boundary inside `parent` that also catches the root's errors whose `_tag` is in `tags`: `[Provider, useX]`. A tag the root doesn't declare, one a boundary above catches (`AlreadyHandledAbove`) or one more than one error carries (`TagSharedByMoreThanOneError`) is a type error |
| `useX(query)`                                                   | Reads a query, suspending until its first result: `Read<A, Left<E, Handled>>`. Failures a boundary in the chain catches go there                                                                                                                                                      |
| `Boundary.Read<A, E>`                                           | `A` when `E` is `never`, else `A \| Unhandled<E>`                                                                                                                                                                                                                                     |
| `Boundary.Unhandled<E>`                                         | A failure no boundary in the chain catches, handed back to the component: `error` (an `E`) and `cause`                                                                                                                                                                                |
| `Boundary.isUnhandled(read)`                                    | Narrows a read to its `Unhandled`                                                                                                                                                                                                                                                     |
| `Boundary.useRun(boundary)`                                     | `(mutation) => Promise<Read<A, Left<E, Handled>>>`. Failures a boundary in the chain catches go there, and the promise never settles                                                                                                                                                  |
| `Boundary.Left<E, Handled>`                                     | The members of `E` whose `_tag` isn't in `Handled`                                                                                                                                                                                                                                    |
| `Boundary.HandledBy<typeof Provider>`                           | The tags a boundary and the ones above it catch                                                                                                                                                                                                                                       |
| `Boundary.FallbackProps<E>`                                     | A boundary's fallback's props: `error` (one of its own errors) and `retry()`                                                                                                                                                                                                          |
| `Boundary.RootFallbackProps`                                    | The root's fallback's props: `cause` and `retry()`, which refetches every failed query                                                                                                                                                                                                |
| `Boundary.caughtBy(error)`                                      | For `onCaughtError`: `{ boundary, name, root, error, cause }`, or `undefined`. `onCaught` gets the same                                                                                                                                                                               |

### Queries and the cache

| Export                                    | Use                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Query.make({ key, effect, staleTime? })` | A query. Its error type is `effect`'s; `staleTime` (default `0`) is how long a result stays fresh                                |
| `Mutation.make({ effect })`               | A mutation, for `Boundary.useRun`                                                                                                |
| `QueryClient.make(layer, { gcTime? })`    | The app's services and a cache in one [`ManagedRuntime`](https://effect.website/docs/v4/api/effect/ManagedRuntime)               |
| `QueryClient.runPromise(client, effect)`  | Runs an Effect with the client's services, such as a route loader's prefetch                                                     |
| `QueryCache.prefetch(query)`              | An Effect that starts the query unless a fresh result is cached or one is in flight                                              |
| `QueryCache.fetch(query)`                 | `prefetch`, then waits for the result, failing with the query's errors                                                           |
| `QueryCache.invalidate(keyPrefix)`        | Marks matching entries stale: read ones refetch and keep their data on screen until the new result arrives, the rest are dropped |

Not there yet: server rendering and hydration, paged queries, and devtools.
