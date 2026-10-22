---
title: Typed error boundaries over atoms
description: "Experiment: React error boundaries that catch typed Effect failures from effect/reactivity atoms, broad ones high in the tree and narrow ones low, and take what they catch off the type of every read below them."
section: Experiments
order: 1
---

> [!WARNING]
> An experiment, not part of raf-query. `@raf-query/experimental-effect-atom` is a private package in the raf-query repo; it isn't published, and its API can change or go away. It's here to try the idea out and to compare it with other ways of doing the same thing.

Effect failures are typed: an RPC can fail with `Unauthorized`, `Forbidden` or `DocNotFound`, and the type says so. React's [error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) catch whatever a component throws, and the type is gone by the time they see it. This experiment puts the two together: a chain of boundaries, each catching some errors by their `_tag`, where an error a boundary catches is taken off the type of every read under it. Broad failures such as a signed-out session are caught high in the tree; narrow ones such as no access to one document are caught low; what no boundary catches comes back to the component, which the compiler makes handle it.

The data comes from [`effect/reactivity`](https://effect.website/docs/v4/api/effect/reactivity/Atom) atoms, read with [`@effect/atom-react`](https://effect.website/docs/v4/api/atom-react)'s registry. The demo runs an Effect RPC API in your browser, read through [`AtomRpc`](https://effect.website/docs/v4/api/effect/reactivity/AtomRpc#Service) atoms.

## Try it

Each dashed box is a boundary. The chaos switches make the server fail at runtime; the type switches below the app change how the code is written, and show what TypeScript says about it:

```demo
effect-atom-boundaries
```

## The type controls

The type switches rewrite the boundaries and the two components that read through them: which tags `Session` and `DocAccess` catch, whether the root declares its errors, and whether `DocPage` checks for an `Unhandled` before it reads `.title`. The code panel shows the code they give, with TypeScript's diagnostics under the lines they're about, and the hover of `docs` and `doc`, the values the hooks return. Some combinations to try:

- Turn off **Session catches `Unauthorized`**. Nothing above the doc list catches it, so `docs` is `DocSummary[] | Unhandled<Unauthorized>`, and `docs.map` doesn't type-check. The doc page's match now misses a case.
- Turn on **DocAccess also catches `Unauthorized`**. `Session` already catches it, so the tag list is a type error: `AlreadyHandledAbove: "Unauthorized"`.
- Turn on **…spelled `Forbiden`**. Tags are checked against the root's errors, so the misspelling is an error with a suggestion, not a boundary that never catches anything.
- Turn off **The root declares its errors**. With no error universe, no tag can be caught, and every tag list says how to fix that.
- Turn on **DocAccess catches `DocNotFound`**, then **DocPage reads `.title` without `isUnhandled`**. Nothing is left, so `doc` is the plain data, the code compiles, and the app above switches to it: open the doc that doesn't exist, and `DocAccess` catches it.

TypeScript compiled every combination when the demo was built (`scripts/type-levels.ts`, with its language service), and the page looks the current one up; no compiler runs in the browser. The demo's typecheck and build fail when the precomputed output is out of date. When the code compiles, the app runs the same chain; when it doesn't, the app keeps running the last code that compiled.

## The mental model

A boundary chain is an Effect pipeline laid over the component tree:

- **The runtime is the `provide`.** An atom is made on a runtime ([`Atom.runtime(layer)`](https://effect.website/docs/v4/api/effect/reactivity/Atom#runtime)), which provides the services its Effect needs, the way [`Effect.provide`](https://effect.website/docs/v4/api/effect/Effect#provide) would. The types check that where the atom is made, so the boundaries need no client.
- **Each boundary is a `catchTags`.** `Boundary.catchErrors(parent, { tags })` is [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) for the subtree it wraps: it catches the errors with those `_tag`s and renders its fallback instead. Its hook's return type has them removed, along with everything its parents catch.
- **The root catches the rest.** `Boundary.root` catches what no typed boundary can: defects, interrupts, and anything else thrown while rendering. It also declares, as a type, the errors the boundaries under it can catch.

A failure is routed by its [`Cause`](https://effect.website/docs/v4/api/effect/Cause). Its typed error ([`Cause.findError`](https://effect.website/docs/v4/api/effect/Cause#findError)) goes to the innermost boundary, in the chain of the hook that read it, that lists its `_tag`. If none does (or it has no string `_tag`), it comes back to the component. A cause with no typed error, a defect or an interrupt, goes to the root, whatever is inside it.

The chain a failure follows is the one of the hook a component called, not whichever boundaries happen to be mounted above it. That keeps the type and the runtime in agreement: a component reading through `useSession` gets back exactly what `Session` and its parents don't catch.

## Atoms

The page's examples use the issue tracker from [Using Effect](./effect.md#the-whole-picture): an `IssueApi` service whose `get` fails with `IssueNotFound | Unauthorized`, and whose `rename` fails with `EmptyTitle | Unauthorized`. Atoms on a runtime built from its layer:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#atoms
```

[`Atom.family`](https://effect.website/docs/v4/api/effect/reactivity/Atom#family) gives one atom per id, so every component that reads issue 1 shares one request and one result. `runtime.fn` makes a function atom: writing to it runs the Effect, and its value is the result.

An atom only uses services its runtime provides. One that needs another doesn't type-check where it's made. TypeScript reports it against `runtime.atom`'s last overload, the `Stream` one, but the service in the `Effect`'s type is what's missing:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#services
```

## Boundaries

`Boundary.root` and `Boundary.catchErrors` each return a pair, like `useState`: the boundary, a component to mount, and the hook that reads atoms through it. The boundary is also the handle the next `catchErrors` builds on.

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.boundaries.tsx#boundaries
```

The root's `errors` is the error universe: every error the atoms under it can fail with, as a type. `Boundary.errors<E>()` is a phantom, an empty object at runtime, so the module that declares the boundaries imports its errors with `import type`. A boundary's `tags` are checked against the universe, and its fallback's `error` is the universe's type for those tags (`Unauthorized` here). The root's fallback gets the whole `Cause` instead, since a defect has no typed error.

A boundary can't list a tag one above it already catches: it would never see one. The type error names the tag:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#caught-above
```

Mount the chain in the order it was made, under a [`RegistryProvider`](https://effect.website/docs/v4/api/atom-react/RegistryContext#RegistryProvider) (or the default registry), with a `Suspense` boundary inside, for the reads:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.boundaries.tsx#mount
```

A boundary mounted outside its parent throws `<Session> needs <App> above it`, and a hook called outside its boundary throws `useSession() needs <Session> above it`. The types promise that a boundary above catches what the hook leaves out, so the hooks check that it's there.

## Errors by tag

Boundaries name errors by tag, and the tags are checked against the universe the root declares. With [`AtomRpc`](https://effect.website/docs/v4/api/effect/reactivity/AtomRpc#Service), `Boundary.RpcErrors` gives the universe from the [`RpcGroup`](https://effect.website/docs/v4/api/effect/rpc/RpcGroup) the client is built from: each procedure's error, its middlewares' errors, and the transport's [`RpcClientError`](https://effect.website/docs/v4/api/effect/rpc/RpcClientError), the same union a query's atom fails with:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.rpc.ts#rpc-errors
```

Without RPC, or with other errors too, write the union yourself, as the boundaries above do. Any type with a literal `_tag` works, with or without a schema.

A tag the universe doesn't have is a type error, with a suggestion:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#typo
```

A boundary matches by tag alone, so it can't tell two errors with the same tag apart. Catching a tag that two errors of the universe share is a type error; a shared tag nobody catches is fine:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#shared-tag
```

For the same reason, an atom whose error has a caught tag but isn't the universe's type for it can't be read through that boundary: its fallback would get a value its props don't describe. Through a boundary that doesn't catch the tag, it comes back as an `Unhandled`:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#another-type
```

A root with no `errors` has an empty universe: no tag can be caught under it, and the type error says to pass `errors`.

### Only types cross into the UI

The modules that declare boundaries, fallbacks and components import the errors with `import type`, which the build erases. In the demo, the production build's module graph has the contract (`api.ts`) imported by the RPC client and the in-browser server only; the boundaries and the components don't import it. In this page's examples, `effect-atom-boundaries.boundaries.tsx` emits no import of `~/issues.ts`, and the atoms' module imports only the `IssueApi` service and its layer.

That keeps the error classes out of the modules, not out of the bundle: an RPC client still imports its `RpcGroup` at runtime, schemas included, to decode responses.

### Caveats

- **Tag collisions.** Matching by tag can't tell two types with the same tag apart, so the types rule out every place they could meet: catching a shared tag, and reading an atom that carries a caught tag as another type. An error typed `{ _tag: string }` could carry any tag, so it can't be read through a chain that catches any.
- **The typed failure channel is trusted.** A boundary checks the tag, not the fields. That holds for `AtomRpc`: the client decodes each failure with the procedure's error schemas, so it is an instance of the type it says. A hand-written Effect can lie, with a cast or a `catch` that returns parsed JSON as an error type: then a fallback can get a value without the fields it reads, and a read typed as plain data can get an `Unhandled`. Validate where the Effect is built, with [`Schema`](https://effect.website/docs/v4/api/effect/Schema) decoding, which is where Effect wants it anyway.

## Reading through a boundary

A boundary's hook takes an atom of an [`AsyncResult`](https://effect.website/docs/v4/api/effect/reactivity/AsyncResult) and suspends until it has one. Errors a boundary in the chain catches go there. The rest come back as an `Unhandled`, which `Boundary.isUnhandled` tells apart from the data:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#read
```

[`Match.valueTags`](https://effect.website/docs/v4/api/effect/Match#valueTags) is exhaustive: it needs a case for each error that's left, and only those. Until `isUnhandled` rules the failure out, the data's fields aren't there:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#unhandled
```

Read through `App`, which catches nothing typed, the issue can also fail with `Unauthorized`, and a match that forgets it names it:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#non-exhaustive
```

A case for an error a boundary above caught is a type error too: under `Session`, `Unauthorized: …` doesn't type-check, since it can't reach the component.

### Nothing left: plain data

When the chain catches every error an atom can fail with, the hook returns the data itself. There's no `Unhandled` to rule out:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#nothing-left
```

## Retry

A fallback's `retry` refreshes the failed atoms its boundary catches and renders the children again; the root's refreshes every failed atom. Function atoms (writes) are skipped, so retrying doesn't send a write again. A refreshed atom is pending again, so the reads under the boundary suspend until the new result comes in, and a failure that's still there goes back to the boundary.

The demo's fallbacks fix the cause first, then retry: _Sign in_ signs back in, _Reconnect_ goes back online.

## Writes

`Boundary.useSet(boundary, atom)` returns a function that writes to a function atom through `boundary` and resolves to its result, narrowed as a read's would be:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#writes
```

An error a boundary in the chain catches goes to that boundary, which renders its fallback, and the promise never settles. `useSet` is a hook of its own, rather than a method of the boundary's hook: React Compiler treats any property of a `use…` function as a hook used as a value.

## Which boundary caught what

The root takes `onCaught`, called once for each failure a boundary of its chain renders a fallback for, with which boundary and why. [`createRoot`](https://react.dev/reference/react-dom/client/createRoot#parameters)'s `onCaughtError` sees the same failures, among everything else React's boundaries catch, and `Boundary.caughtBy` picks them out:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.boundaries.tsx#caught
```

The demo's event log comes from `onCaught`.

## With `@effect/atom-react`

The boundaries read through `@effect/atom-react`'s registry: the [`RegistryContext`](https://effect.website/docs/v4/api/atom-react/RegistryContext#RegistryContext) a `RegistryProvider` sets, or its default. A boundary's hook subscribes with [`useAtomValue`](https://effect.website/docs/v4/api/atom-react/Hooks#useAtomValue), so atoms keep their usual lifecycle: an atom is built when first read, shared by every reader, refreshed when its [`Reactivity`](https://effect.website/docs/v4/api/effect/reactivity/Reactivity#invalidate) keys are invalidated, and dropped once nothing has read it for its idle time.

[`useAtomSuspense`](https://effect.website/docs/v4/api/atom-react/Hooks#useAtomSuspense) suspends the same way, and throws a failure to the nearest error boundary as [`Cause.squash`](https://effect.website/docs/v4/api/effect/Cause#squash) of its cause: the nearest boundary gets every error, untyped, and the component's type doesn't change. With `includeFailure: true` it returns the `AsyncResult` instead, and every component matches every error. A boundary's hook sits between the two: what a boundary catches is caught there, typed, and the type of the read says what's left.

## API reference

All of it is under `Boundary`: `import { Boundary } from "@raf-query/experimental-effect-atom"`.

| Export                                          | What it is                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `root({ name, errors?, fallback, onCaught? })`  | The outermost boundary, as a `[Boundary, hook]` pair. It catches defects, interrupts and render errors; `fallback` gets `RootFallbackProps`. `errors` declares the error universe; `onCaught` hears about every failure the chain catches. |
| `errors<E>()`                                   | The error universe for `root`'s `errors`: a phantom, an empty object at runtime.                                                                                                                                                           |
| `RpcErrors<typeof Group>`                       | Everything a client of an `RpcGroup` can fail with: each procedure's error, its middlewares' errors, and `RpcClientError`.                                                                                                                 |
| `catchErrors(parent, { name, tags, fallback })` | A boundary inside `parent` that also catches the errors tagged `tags`. Each tag must be the universe's, carried by one of its types, and not caught above. `fallback` gets `FallbackProps<E>`, with `E` the universe's types for `tags`.   |
| the hook                                        | `useX(atom)` reads an `AsyncResult` atom through boundary `X`: `A` when the chain catches every error, else `A \| Unhandled<E>` with `E` what's left. Suspends while the atom is pending.                                                  |
| `useSet(boundary, atom)`                        | A function that writes to a function atom and resolves to its result, narrowed like a read. Caught errors go to the boundary, and the promise never settles.                                                                               |
| `isUnhandled(value)`                            | Whether a read or a write gave back an `Unhandled`.                                                                                                                                                                                        |
| `Unhandled<E>`                                  | A failure no boundary in the chain catches: `error`, the typed error, and `cause`, its `Cause`.                                                                                                                                            |
| `FallbackProps<E>`                              | `error`, the caught error, and `retry`.                                                                                                                                                                                                    |
| `RootFallbackProps`                             | `cause`, why it failed, and `retry`.                                                                                                                                                                                                       |
| `caughtBy(error)`                               | For `onCaughtError`: the `Caught` for a failure a boundary caught, or `undefined` for anything else React caught.                                                                                                                          |
| `Caught`                                        | `name` and `boundary`, which boundary caught it; `root`, whether that's the root; `error`, the typed error, `undefined` for a defect; and `cause`.                                                                                         |
| `HandledBy<B>`, `UniverseOf<B>`                 | The tags boundary `B` and its parents catch, and its root's universe.                                                                                                                                                                      |
| `TagChecks`, `MatchesUniverse`, `NoUniverse`    | The types behind the tag errors: `AtLeastOneTag`, `AlreadyHandledAbove`, `TagSharedByMoreThanOneError`, and `CaughtAsAnotherType`.                                                                                                         |
| `isBoundary(u)`                                 | Whether `u` is a boundary made by `root` or `catchErrors`.                                                                                                                                                                                 |
