---
title: Typed error boundaries over atoms
description: "Experiment: React error boundaries that catch typed Effect failures from effect/reactivity atoms, broad ones high in the tree and narrow ones low, and take what they catch off the type of every read below them."
section: Experiments
order: 1
---

> [!WARNING]
> An experiment, not part of raf-query. `@raf-query/experimental-effect-atom` is a private package in the raf-query repo; it isn't published, and its API can change or go away. It's here to try the idea out and to compare it with other ways of doing the same thing.

Effect failures are typed: an RPC can fail with `Unauthorized`, `Forbidden` or `DocNotFound`, and the type says so. React's [error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) catch whatever a component throws, and the type is gone by the time they see it. This experiment puts the two together: a chain of boundaries, each catching some error classes, where an error a boundary catches is taken off the type of every read under it. Broad failures such as a signed-out session are caught high in the tree; narrow ones such as no access to one document are caught low; what no boundary catches comes back to the component, which the compiler makes handle it.

The data comes from [`effect/reactivity`](https://effect.website/docs/v4/api/effect/reactivity/Atom) atoms, read with [`@effect/atom-react`](https://effect.website/docs/v4/api/atom-react)'s registry. The demo runs an Effect RPC API in your browser, read through [`AtomRpc`](https://effect.website/docs/v4/api/effect/reactivity/AtomRpc#Service) atoms. Each dashed box is a boundary:

```demo
effect-atom-boundaries
```

## The mental model

A boundary chain is an Effect pipeline laid over the component tree:

- **The runtime is the `provide`.** An atom is made on a runtime ([`Atom.runtime(layer)`](https://effect.website/docs/v4/api/effect/reactivity/Atom#runtime)), which provides the services its Effect needs, the way [`Effect.provide`](https://effect.website/docs/v4/api/effect/Effect#provide) would. The types check that where the atom is made, so the boundaries need no client.
- **Each boundary is a `catchTags`.** `Boundary.catchErrors(parent, { errors })` is [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) for the subtree it wraps: it catches those error classes and renders its fallback instead. Its hook's return type has them removed, along with everything its parents catch.
- **The root catches the rest.** `Boundary.root` catches what no typed boundary can: defects, interrupts, and anything else thrown while rendering.

A failure is routed by its [`Cause`](https://effect.website/docs/v4/api/effect/Cause). Its typed error ([`Cause.findError`](https://effect.website/docs/v4/api/effect/Cause#findError)) goes to the innermost boundary, in the chain of the hook that read it, whose schemas accept it ([`Schema.is`](https://effect.website/docs/v4/api/effect/Schema#is)). If none does, it comes back to the component. A cause with no typed error, a defect or an interrupt, goes to the root.

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
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#boundaries
```

A fallback is a component. It gets the error it caught, typed by the boundary's `errors`, and a `retry`. The root's gets the whole `Cause` instead, since a defect has no typed error.

A boundary can't list an error class one above it already catches: it would never see one. The type error names the class:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.errors.tsx#caught-above
```

Mount the chain in the order it was made, under a [`RegistryProvider`](https://effect.website/docs/v4/api/atom-react/RegistryContext#RegistryProvider) (or the default registry), with a `Suspense` boundary inside, for the reads:

```sample
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#mount
```

A boundary mounted outside its parent throws `<Session> needs <App> above it`, and a hook called outside its boundary throws `useSession() needs <Session> above it`. The types promise that a boundary above catches what the hook leaves out, so the hooks check that it's there.

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
tanstack-start-effect/src/docs/effect-atom-boundaries.tsx#caught
```

The demo's event log comes from `onCaught`.

## With `@effect/atom-react`

The boundaries read through `@effect/atom-react`'s registry: the [`RegistryContext`](https://effect.website/docs/v4/api/atom-react/RegistryContext#RegistryContext) a `RegistryProvider` sets, or its default. A boundary's hook subscribes with [`useAtomValue`](https://effect.website/docs/v4/api/atom-react/Hooks#useAtomValue), so atoms keep their usual lifecycle: an atom is built when first read, shared by every reader, refreshed when its [`Reactivity`](https://effect.website/docs/v4/api/effect/reactivity/Reactivity#invalidate) keys are invalidated, and dropped once nothing has read it for its idle time.

[`useAtomSuspense`](https://effect.website/docs/v4/api/atom-react/Hooks#useAtomSuspense) suspends the same way, and throws a failure to the nearest error boundary as [`Cause.squash`](https://effect.website/docs/v4/api/effect/Cause#squash) of its cause: the nearest boundary gets every error, untyped, and the component's type doesn't change. With `includeFailure: true` it returns the `AsyncResult` instead, and every component matches every error. A boundary's hook sits between the two: what a boundary catches is caught there, typed, and the type of the read says what's left.

## API reference

All of it is under `Boundary`: `import { Boundary } from "@raf-query/experimental-effect-atom"`.

| Export                                            | What it is                                                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root({ name, fallback, onCaught? })`             | The outermost boundary, as a `[Boundary, hook]` pair. It catches defects, interrupts and render errors; `fallback` gets `RootFallbackProps`. `onCaught` hears about every failure the chain catches. |
| `catchErrors(parent, { name, errors, fallback })` | A boundary inside `parent` that also catches `errors`, error classes such as `Schema.TaggedError`s. `fallback` gets `FallbackProps<E>`. Listing a class `parent`'s chain catches is a type error.    |
| the hook                                          | `useX(atom)` reads an `AsyncResult` atom through boundary `X`: `A` when the chain catches every error, else `A \| Unhandled<E>` with `E` what's left. Suspends while the atom is pending.            |
| `useSet(boundary, atom)`                          | A function that writes to a function atom and resolves to its result, narrowed like a read. Caught errors go to the boundary, and the promise never settles.                                         |
| `isUnhandled(value)`                              | Whether a read or a write gave back an `Unhandled`.                                                                                                                                                  |
| `Unhandled<E>`                                    | A failure no boundary in the chain catches: `error`, the typed error, and `cause`, its `Cause`.                                                                                                      |
| `FallbackProps<E>`                                | `error`, the caught error, and `retry`.                                                                                                                                                              |
| `RootFallbackProps`                               | `cause`, why it failed, and `retry`.                                                                                                                                                                 |
| `caughtBy(error)`                                 | For `onCaughtError`: the `Caught` for a failure a boundary caught, or `undefined` for anything else React caught.                                                                                    |
| `Caught`                                          | `name` and `boundary`, which boundary caught it; `root`, whether that's the root; `error`, the typed error, `undefined` for a defect; and `cause`.                                                   |
| `HandledBy<B>`                                    | The errors boundary `B` and its parents catch.                                                                                                                                                       |
| `NotYetHandled<S, Handled>`                       | The type `catchErrors` checks `errors` against: `{ AlreadyHandledAbove: "Tag" }` when a parent catches one of them.                                                                                  |
| `isBoundary(u)`                                   | Whether `u` is a boundary made by `root` or `catchErrors`.                                                                                                                                           |
