---
title: Typed error boundaries (experimental)
description: A chain of error boundaries that each catch some of an Effect query's errors. The compiler checks that every error is handled before a read returns plain data.
section: Integrations
order: 7
---

> [!WARNING]
> Experimental: `@raf-query/react/boundary` can change in any release.

A [`Result`](https://effect.website/docs/v4/api/effect/Result) per read ([Effect typed errors](./effect-errors.md#in-react)) handles every failure where it happens. Some failures belong higher up. A signed-out session is the app's problem, not each component's: one boundary near the top shows the sign-in screen for all of them. A missing document belongs to the page that shows it.

Typed error boundaries split an Effect query's error type over the component tree. Each boundary is a [React error boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) that catches some of the errors, like [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) for the subtree it wraps. A component reads through a boundary, and the read's error type is what that boundary and the ones above it don't catch. When nothing is left, the read returns the data itself.

```demo
typed-error-boundaries
```

## How it works

A chain starts at a root and grows inward, one `catchErrors` at a time:

- The root catches what no error type names: defects, interrupts, and anything thrown while rendering.
- Each boundary below it lists the error classes it catches, as schemas such as a [`Schema.TaggedError`](https://effect.website/docs/v4/api/effect/Schema#TaggedError). The types read the classes, and the runtime matches failures against them with [`Schema.is`](https://effect.website/docs/v4/api/effect/Schema#is), so the two agree.
- A query's first load that fails with a typed failure goes to the innermost boundary in the chain the component read through whose classes accept it. That boundary renders its fallback in place of its children.
- A failure no boundary catches comes back to the component, in the `Result` of `useResult`.
- A defect goes to the root. It isn't in any error type, so no typed boundary can catch it.

Every boundary is a pair, like `useState`: the Provider to render, and the hook that reads through it.

## Define the chain

The examples use the issue tracker from [Using Effect](./effect.md#the-whole-picture). Its `IssueApi` fails with `IssueNotFound` and `Unauthorized`.

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#the-chain
```

`Boundary.root` takes a `client` to provide to the tree, or reads the nearest `QueryClientProvider`'s, as here. Its type argument is then the services the client's [layer](./effect-services.md#services-in-queryclient) provides. Effects run through the chain can only use those services.

## Render the Providers

The Providers nest in the order the chain was built:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#mount
```

The types are only true inside the Provider: a hook is typed by the boundary it reads through. Each hook checks that its Provider is above it, and each Provider that its parent is, and throws an error naming the missing one otherwise.

## Read through a boundary

`Provider.useResult` reads a query the way `useQuery` and [`use()`](https://react.dev/reference/react/use) do, and suspends until the first result. A failure the chain catches goes to its boundary. The rest comes back as the `Result`'s failure:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#what-is-left
```

Read through `Session`, an issue can still fail with `IssueNotFound`, so that's the failure type. [`Match.valueTags`](https://effect.website/docs/v4/api/effect/Match#valueTags) has to handle it, and only it.

## The compiler keeps it exhaustive

The hook itself, `useSession`, returns the data, not a `Result`. It only type-checks when there's no failure left to get. The type error names the tags still left:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#unhandled
```

A `Result` from further out has more failures in it. A `Match.valueTags` that misses one doesn't compile, and the error names the missing tag:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#exhaustive
```

The other way round, a case for an error a boundary already caught is a type error, not dead code. The failure can't reach this component:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#caught-above
```

A boundary can't catch what one above it catches either. It would never see one:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#catching-twice
```

## Nothing left: plain data

A boundary that catches the last error leaves nothing to handle. Its hook returns the issue itself, with no `Result` and nothing to match:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#nothing-left
```

## Run Effects through the chain

`Provider.useRun()` returns a function that runs an Effect with the client's services, the same way `queryClient.runPromise` does. Its failures route the way a read's do. A failure a boundary catches goes there, and the promise never settles: the fallback replaced the component that was waiting.

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#run
```

`run.result` resolves with a `Result` of what's left. `run` itself resolves with the success, so it only type-checks when nothing is left, and only with services the client provides:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#run-types
```

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#run-unhandled
```

## Retry

A fallback's `retry` renders the boundary's children again. Before it does, every first load that failed and that nothing on screen shows starts over. That includes the queries the fallback unmounted, and the ones React never got to: it stops rendering a subtree at the first component that throws. A boundary's retry doesn't touch the failures other boundaries are showing.

Fix the cause first, then retry. `SignIn` signs in and then calls `retry`.

## Which failures reach a boundary

- Only a first load does. A refetch that fails keeps the data on screen, as everywhere in raf-query ([Effect typed errors](./effect-errors.md#or-let-it-throw)). The demo resets the cache when you flip a switch for that reason.
- A failure is routed by its [`Cause`](https://effect.website/docs/v4/api/effect/Cause): its typed failure ([`Cause.findError`](https://effect.website/docs/v4/api/effect/Cause#findError)) for the typed boundaries, the whole Cause for the root.
- A query that failed on the server and was hydrated arrives without a Cause, so it goes to the root. The browser can't tell what the server's failure was ([SSR and hydration](./ssr-and-hydration.md#errors)).
- A failure that a boundary's types said was caught, and wasn't, also goes to the root. That happens when a cast or a query's types lie.

## Log what was caught

React tells a root's [`onCaughtError`](https://react.dev/reference/react-dom/client/createRoot#parameters) about every error a boundary caught. `Boundary.caughtBy` says which boundary caught it, and why:

```tsx twoslash
import { Boundary } from "@raf-query/react/boundary";
import { createRoot } from "react-dom/client";
declare const container: HTMLElement;
declare function report(boundary: string, error: unknown): void;
// ---cut---
const root = createRoot(container, {
	onCaughtError: (error) => {
		const caught = Boundary.caughtBy(error);
		if (caught !== undefined) {
			report(caught.boundary.displayName, caught.error);
		}
	},
});
```

It returns `undefined` for anything else React caught. The failure is logged once, even under `StrictMode`.

## API reference

Import `Boundary` from `@raf-query/react/boundary`.

### `Boundary.root(options)`

Returns `[Provider, useRead]` for the outermost boundary.

- `name`: the boundary's name, for error messages, `caughtBy` and React DevTools.
- `fallback`: a component, rendered with `{ cause, retry }` in place of the app while a defect, an interrupt or an uncaught failure stands.
- `client` (optional): a `QueryClient` to provide to the tree. Without it, the root reads the nearest `QueryClientProvider`'s and its type argument is the client's services: `Boundary.root<IssueApi>({ … })`.

### `Boundary.catchErrors(parent, options)`

Returns `[Provider, useRead]` for a boundary inside `parent` (a Provider) that also catches `options.errors`.

- `errors`: the error classes it catches. An error `parent`'s chain already catches is a type error.
- `fallback`: a component, rendered with `{ error, retry }`. `error` is typed by `errors`.
- `name`: as for `root`.

### The pair

- `Provider`: renders the boundary around `children`. It is also the boundary itself, passed to `catchErrors` as a parent.
- `useRead(factory, handle, options?)`: the query's data. Type-checks only when the chain catches every error the query can fail with.
- `Provider.useResult(factory, handle, options?)`: a `Result<Data, Left>`, where `Left` is the query's error type without what the chain catches.
- `Provider.useRun()`: a function `run(effect)` that resolves with the success and type-checks only when nothing is left, and `run.result(effect)` that resolves with a `Result` of what's left.

`options` are `useQuery`'s.

### Types and helpers

- `Boundary.FallbackProps<E>`: `{ error: E; retry: () => void }`.
- `Boundary.RootFallbackProps`: `{ cause: Cause<unknown>; retry: () => void }`.
- `Boundary.HandledBy<typeof Provider>`: the errors a boundary and the ones above it catch.
- `Boundary.caughtBy(error)`: `{ boundary, cause, error }` for a failure a boundary caught, else `undefined`.
- `Boundary.isBoundary(u)`: whether `u` is a boundary's Provider.
- `Boundary.Run<Handled, R>`: the type of `useRun()`'s function.
