---
title: Typed error boundaries in raf-query
description: A chain of error boundaries that each catch some of an Effect query's errors, by tag. A read returns the data, or what no boundary caught, and plain data once nothing is left.
section: Experiments
order: 4
---

> [!WARNING]
> Experimental: `@raf-query/react/boundary` can change in any release.

A [`Result`](https://effect.website/docs/v4/api/effect/Result) per read ([Effect typed errors](./effect-errors.md#in-react)) handles every failure where it happens. Some failures belong higher up. A signed-out session is the app's problem, not each component's: one boundary near the top shows the sign-in screen for all of them. A missing document belongs to the page that shows it.

Typed error boundaries split an Effect query's error type over the component tree. Each boundary is a [React error boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) that catches some of the errors by their `_tag`, like [`Effect.catchTags`](https://effect.website/docs/v4/api/effect/Effect#catchTags) for the subtree it wraps. A component reads through a boundary and gets the data, or an `Unhandled` holding an error that boundary and the ones above it don't catch. When nothing is left, the read returns the data itself.

## Live demo

```demo
typed-error-boundaries
```

The chaos switches make the server fail, and each failure lands on the boundary that catches it. The type switches change which boundaries catch what. Next to them is the code for that configuration with the errors `tsc` reports, compiled at build time. The `^?` line shows what the read returns. The app runs the configuration when it compiles.

## How it works

A chain starts at a root and grows inward, one `catchErrors` at a time:

- The root declares, as a type, every error the app's queries and Effects can fail with. It catches what no error type names: defects, interrupts, anything thrown while rendering, and the failures of a query with a promise `queryFn`.
- Each boundary below it lists the `_tag`s it catches. The types check the list against the root's errors, and the runtime matches a failure's `_tag` against it.
- A query's first load that fails with a typed failure goes to the innermost boundary in the chain the component read through that lists its tag. That boundary renders its fallback in place of its children.
- A failure no boundary catches comes back to the component, as an `Unhandled`.
- A defect goes to the root. It isn't in any error type, so no typed boundary can catch it.

Every boundary is a pair, like `useState`: the Provider to render, and the hook that reads through it.

## Define the chain

The examples use the issue tracker from [Using Effect](./effect.md#the-whole-picture). Its `IssueApi` fails with `IssueNotFound`, `Unauthorized` and `EmptyTitle`.

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#the-chain
```

`Boundary.root` takes a `client` to provide to the tree, or reads the nearest `QueryClientProvider`'s, as here. Its first type argument is then the services the client's [layer](./effect-services.md#services-in-queryclient) provides: Effects run through the chain can only use those. The second is the app's errors. With a `client`, pass the errors as a value instead, and both are inferred:

```tsx
const [App, useApp] = Boundary.root({
	client,
	errors: Boundary.errors<AppError>(),
	fallback: Crashed,
	name: "App",
});
```

An [Effect RPC](https://effect.website/docs/v4/api/effect/rpc/RpcGroup) contract already says what its procedures fail with. `Boundary.RpcErrors` reads it: each procedure's own errors, its middleware's, and the client's `RpcClientError`:

```ts twoslash
import { Boundary } from "@raf-query/react/boundary";
import { Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
class DocNotFound extends Schema.TaggedError<DocNotFound>()("DocNotFound", {
	id: Schema.Int,
}) {}
class Session extends RpcMiddleware.Service<Session>()("Session", {
	error: Unauthorized,
}) {}
// ---cut---
const DocRpcs = RpcGroup.make(
	Rpc.make("GetDoc", {
		error: DocNotFound,
		payload: { id: Schema.Int },
		success: Schema.String,
	}),
).middleware(Session);

type AppError = Boundary.RpcErrors<typeof DocRpcs>;
//   ^?
```

## Import errors as types

A boundary needs the error tags, not the error classes. The chain's module and the components that read through it import errors with [`import type`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export), as the sample does, so no error schema is bundled for them. [`Match.valueTags`](https://effect.website/docs/v4/api/effect/Match#valueTags) matches tags too.

That trusts the tag, so a few things hold it up:

- Two errors with the same tag are one error to the runtime. The types reject a tag that more than one of the app's errors has.
- A failure is what its `_tag` says. An RPC client decodes each failure with the contract's schemas, so it is. An Effect you write can claim any tag through a cast.
- The RPC client still bundles the contract's schemas, to decode what the server sends. `import type` keeps them out of the boundaries and components, not out of the app.

## Render the Providers

The Providers nest in the order the chain was built:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#mount
```

The types are only true inside the Provider: a hook is typed by the boundary it reads through. Each hook checks that its Provider is above it, and each Provider that its parent is, and throws an error naming the missing one otherwise.

## Read through a boundary

The hook reads a query the way `useQuery` and [`use()`](https://react.dev/reference/react/use) do, and suspends until the first result. A failure the chain catches goes to its boundary. Any other one comes back as an `Unhandled`, which `Boundary.isUnhandled` tells from the data:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#what-is-left
```

Read through `Session`, an issue can still fail with `IssueNotFound`, so that's the `Unhandled`'s `error`. `Match.valueTags` has to handle it, and only it. The `Unhandled` also holds the whole [`Cause`](https://effect.website/docs/v4/api/effect/Cause), and is the same object on every render of the same failure.

## The compiler keeps it exhaustive

Until the component checks `isUnhandled`, the read may be an `Unhandled`, so using it as the data doesn't compile:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#unhandled
```

Read further out, more errors are left. A `Match.valueTags` that misses one doesn't compile, and the error names the missing tag:

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

A tag none of the app's errors has is a typo:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#typo
```

The fallback's `error` is the errors with the boundary's tags, so `NoSuchIssue` reads `props.error.id`. A query whose error has a listed tag but isn't the app's error of that tag doesn't compile where it's read.

## Nothing left: plain data

A boundary that catches the last error leaves nothing to handle. Its hook returns the issue itself, with nothing to check or match:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#nothing-left
```

## Run Effects through the chain

`Boundary.useRun(Provider)` returns a function that runs an Effect with the client's services, the same way `queryClient.runPromise` does. Its failures route the way a read's do. A failure a boundary catches goes there, and the promise never settles: the fallback replaced the component that was waiting. Any other one resolves as an `Unhandled`:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#run
```

The promise resolves with the success, or an `Unhandled` of what's left, and plain data when nothing is:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.tsx#run-types
```

Using the result before checking it doesn't compile, and neither does an Effect that needs a service the client doesn't provide:

```sample
tanstack-start-effect/src/docs/typed-error-boundaries.type-errors.tsx#run-unhandled
```

## Promise queries

A query whose `queryFn` returns a promise has an `unknown` error: nothing says what it fails with, so no boundary can claim it. Its read returns plain data, and any failure goes to the root, even one with a `_tag` a boundary lists. Write the query with an Effect to route its failures by type.

## Retry

A fallback's `retry` renders the boundary's children again. Before it does, every first load that failed and that nothing on screen shows starts over. That includes the queries the fallback unmounted, and the ones React never got to: it stops rendering a subtree at the first component that throws. A boundary's retry doesn't touch the failures other boundaries are showing.

Fix the cause first, then retry. `SignIn` signs in and then calls `retry`.

## Which failures reach a boundary

- Only a first load does. A refetch that fails keeps the data on screen, as everywhere in raf-query ([Effect typed errors](./effect-errors.md#or-let-it-throw)). The demo resets the cache when you flip a switch for that reason.
- A failure is routed by its `Cause`: the `_tag` of its typed failure ([`Cause.findError`](https://effect.website/docs/v4/api/effect/Cause#findError)) for the typed boundaries, the whole Cause for the root.
- A query that failed on the server and was hydrated arrives without a Cause, so it goes to the root. The browser can't tell what the server's failure was ([SSR and hydration](./ssr-and-hydration.md#errors)).
- A typed failure whose tag no boundary in the chain lists comes back as an `Unhandled`, even where the types said nothing was left. That happens when a cast or a query's types lie.

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

### `Boundary.root<R, U>(options)`

Returns `[Provider, useRead]` for the outermost boundary. `R` is the client's services, `U` the app's errors.

- `name`: the boundary's name, for error messages, `caughtBy` and React DevTools.
- `fallback`: a component, rendered with `{ cause, retry }` in place of the app while a defect, an interrupt or an untyped failure stands.
- `client` (optional): a `QueryClient` to provide to the tree. Without it, the root reads the nearest `QueryClientProvider`'s, and the type arguments say what it has: `Boundary.root<IssueApi, AppError>({ … })`.
- `errors` (optional): `Boundary.errors<U>()`, to name the errors when `R` is inferred from `client`.

### `Boundary.catchErrors(parent, options)`

Returns `[Provider, useRead]` for a boundary inside `parent` (a Provider) that also catches `options.tags`.

- `tags`: the `_tag`s it catches. A tag `parent`'s chain already catches, a tag none of the root's errors has, a tag more than one of them has, and an empty list are type errors.
- `fallback`: a component, rendered with `{ error, retry }`. `error` is the root's errors with those tags.
- `name`: as for `root`.

### The pair

- `Provider`: renders the boundary around `children`. It is also the boundary itself, passed to `catchErrors` as a parent and to `useRun`.
- `useRead(factory, handle, options?)`: the query's data, or an `Unhandled` of an error the chain doesn't catch. When the chain catches every error, the type is the data alone. `options` are `useQuery`'s.

### `Boundary.useRun(Provider)`

A function `run(effect)` that runs `effect` with the client's services. It resolves with the success, or an `Unhandled` of an error the chain doesn't catch, and never settles once a boundary caught the failure.

### Types and helpers

- `Boundary.Unhandled<E>`: `{ error: E; cause: Cause<E> }`, for a failure no boundary caught.
- `Boundary.isUnhandled(value)`: whether a read's or a run's value is an `Unhandled`.
- `Boundary.Read<A, E>`: `A | Unhandled<E>`, or `A` when `E` is `never`.
- `Boundary.errors<U>()`: the root's `errors` option.
- `Boundary.RpcErrors<typeof Group>`: every error an `RpcGroup`'s client can fail with.
- `Boundary.FallbackProps<E>`: `{ error: E; retry: () => void }`.
- `Boundary.RootFallbackProps`: `{ cause: Cause<unknown>; retry: () => void }`.
- `Boundary.UniverseOf<typeof Provider>`: the root's errors.
- `Boundary.HandledBy<typeof Provider>`: the tags a boundary and the ones above it catch.
- `Boundary.Run<U, Handled, R>`: the type of `useRun`'s function.
- `Boundary.caughtBy(error)`: `{ boundary, cause, error }` for a failure a boundary caught, else `undefined`.
- `Boundary.isBoundary(u)`: whether `u` is a boundary's Provider.
