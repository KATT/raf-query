---
title: Typed error boundaries compared
description: Three experiments build the same typed error boundaries for Effect queries in three places. Their shared API, and how they differ.
section: Experiments
order: 1
---

> [!WARNING]
> All three are experiments. None is published, and their APIs will change.

Three experiments build the same thing: [error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) that catch an Effect's failures by type, inspired by [result-rpc](https://result-rpc.com/)'s shells. Broad failures (a signed-out session) are caught high in the tree, narrow ones (no access to one document) low. What no boundary catches comes back to the component, which the compiler makes handle it. When nothing is left, the read is the data itself.

- [On an Effect cache](./effect-query-boundaries.md): a new render-as-you-fetch cache written only in Effect, `@raf-query/experimental-effect-query`.
- [Over atoms](./effect-atom-boundaries.md): boundaries over [`effect/reactivity`](https://effect.website/docs/v4/api/effect/reactivity/Atom) atoms, read with [`@effect/atom-react`](https://effect.website/docs/v4/api/atom-react), `@raf-query/experimental-effect-atom`.
- [In raf-query](./typed-error-boundaries.md): boundaries in `@raf-query/react/boundary`, on raf-query's own cache.

## The shared API

The three export the same `Boundary`. Each boundary is a pair, like [`useState`](https://react.dev/reference/react/useState)'s: the Provider to mount, and the hook that reads through it. The root declares, as a type, every error its boundaries may catch; each `catchErrors` lists the `_tag`s it catches, checked against those errors. This block compiles against `@raf-query/react/boundary`; the comments say where the other two differ:

```tsx twoslash
import {
	type QueryClient,
	type QueryHandle,
	queryOptions,
} from "@raf-query/react";
import { Boundary } from "@raf-query/react/boundary";
import { type Effect, Match, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import type { ReactNode } from "react";
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}) {}
class DocNotFound extends Schema.TaggedError<DocNotFound>()("DocNotFound", {
	id: Schema.Int,
}) {}
class EmptyTitle extends Schema.TaggedError<EmptyTitle>()("EmptyTitle", {}) {}
class Authenticated extends RpcMiddleware.Service<Authenticated>()(
	"Authenticated",
	{ error: Unauthorized },
) {}
const DocRpcs = RpcGroup.make(
	Rpc.make("GetDoc", {
		error: Schema.Union([Forbidden, DocNotFound]),
		payload: { id: Schema.Int },
		success: Schema.Struct({ title: Schema.String }),
	}),
	Rpc.make("RenameDoc", {
		error: EmptyTitle,
		payload: { id: Schema.Int, title: Schema.String },
		success: Schema.Struct({ title: Schema.String }),
	}),
).middleware(Authenticated);
interface Doc {
	readonly title: string;
}
declare const client: QueryClient<never>;
declare function getDoc(
	id: number,
): Effect.Effect<Doc, Forbidden | DocNotFound | Unauthorized>;
declare function renameDoc(
	id: number,
	title: string,
): Effect.Effect<Doc, EmptyTitle | Unauthorized>;
function docQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["doc", input.id],
		queryFn: () => getDoc(input.id),
	});
}
declare function Crashed(props: Boundary.RootFallbackProps): ReactNode;
declare function SignIn(props: Boundary.FallbackProps<Unauthorized>): ReactNode;
declare function NoAccess(props: Boundary.FallbackProps<Forbidden>): ReactNode;
// ---cut---
const [App, useApp] = Boundary.root({
	client, // Over atoms: no client, each atom's runtime provides its services
	errors: Boundary.errors<Boundary.RpcErrors<typeof DocRpcs>>(),
	fallback: Crashed,
	name: "App",
});
const [Session, useSession] = Boundary.catchErrors(App, {
	fallback: SignIn,
	name: "Session",
	tags: ["Unauthorized"],
});
const [DocAccess, useDocAccess] = Boundary.catchErrors(Session, {
	fallback: NoAccess,
	name: "DocAccess",
	tags: ["Forbidden"],
});

function DocPage(props: { readonly doc: QueryHandle<typeof docQuery> }) {
	// On an Effect cache: useDocAccess(docQuery). Over atoms: useDocAccess(docAtom(id)).
	const doc = useDocAccess(docQuery, props.doc);
	//    ^?
	if (Boundary.isUnhandled(doc)) {
		return Match.valueTags(doc.error, {
			DocNotFound: (missing) => <p>No document {missing.id}</p>,
		});
	}
	return <h1>{doc.title}</h1>;
}

function Rename(props: { readonly id: number }) {
	// Over atoms: Boundary.useSet(Session, renameAtom).
	const run = Boundary.useRun(Session);
	return (
		<button
			onClick={async () => {
				const renamed = await run(renameDoc(props.id, ""));
				//    ^?
				if (Boundary.isUnhandled(renamed)) {
					alert("A title can't be empty.");
				}
			}}
		>
			Rename
		</button>
	);
}
```

Each also has `onCaught` on the root and `Boundary.caughtBy` for `onCaughtError`, the same type errors (a tag the root doesn't declare, one a boundary above catches, one two errors share, a read before `isUnhandled`, a match that misses a case or has one too many), and a demo with chaos switches and type switches.

## How they differ

|                                 | On an Effect cache                                                                      | Over atoms                                                                                               | In raf-query                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Engine                          | A new query cache in Effect, run by the client's `ManagedRuntime`                       | `effect/reactivity` atoms, through `@effect/atom-react`'s registry                                       | raf-query's cache                                                                                   |
| Code                            | `.experimental/effect-query/package`                                                    | `.experimental/effect-atom/package`                                                                      | `packages/react/src/boundary`, and a change in `packages/core`                                      |
| What caches                     | Each query's `Exit`, by key, with `staleTime`, `gcTime`, and `invalidate` by key prefix | The atoms: one per key with `Atom.family`, refreshed by `Reactivity` keys, dropped after their idle time | raf-query's entries, which also keep a failed first load's `Cause`                                  |
| What a hook reads               | A `Query`: `useX(query)`                                                                | An atom of an `AsyncResult`: `useX(atom)`                                                                | A factory and a handle: `useX(factory, handle)`                                                     |
| Writes                          | `Boundary.useRun(X)` runs a `Mutation`                                                  | `Boundary.useSet(X, atom)` writes to a function atom                                                     | `Boundary.useRun(X)` runs an Effect                                                                 |
| Which failures reach a boundary | The latest result: a refetch that fails replaces the data                               | The latest result: a refresh that fails replaces the data                                                | First loads only: a refetch that fails keeps the data on screen                                     |
| Retry                           | Refetches the failed queries the boundary catches; the root's, every failed query       | Refreshes the failed atoms the boundary catches, but not function atoms; the root's, every failed atom   | Restarts every failed first load that nothing on screen shows, then renders again                   |
| Untyped failures                | None: every query is an Effect                                                          | A failure without a string `_tag` comes back to the component                                            | A promise `queryFn` has no error type: its read is plain data, and its failures go to the root      |
| Server rendering                | Not yet                                                                                 | Not yet: browser only                                                                                    | raf-query's. A failure hydrated from the server has no `Cause`, so it goes to the root              |
| Changes to `packages/*`         | None                                                                                    | None                                                                                                     | Core keeps a failed first load's `Cause` (`exitThenable`); a new `@raf-query/react/boundary` export |
| Type switches generated by      | `www/build/effect-query-configs.ts` (96 combinations)                                   | `.experimental/effect-atom/demo/scripts/type-levels.ts` (144 combinations)                               | `www/build/type-controls.ts` (24 combinations)                                                      |
| Demo's own chunk, gzipped       | 18.9 kB                                                                                 | 27.2 kB                                                                                                  | 12.1 kB                                                                                             |
| Risks                           | A second cache to keep up: no server rendering, paged queries or devtools               | Tied to `@effect/atom-react`'s registry and hooks; `retry` scans every atom in the registry              | It changes the published packages, and a failed refetch never reaches a boundary                    |

The chunk sizes are each demo's own code: its library, its components and its precomputed type switches. The Effect, RPC and UI code the docs site shares is not counted, and neither is raf-query's cache, which every page of the site already loads.

## How boundaries route errors

In all three, a hook that reads a failure a boundary catches throws an `Escalation` while rendering. The `Escalation` names the boundary the hook found in its own chain. React hands it to the nearest error boundary, and each Provider in between that isn't the one it names throws it again, so it lands where the types said. result-rpc's shells work differently: they hold the errors they claim in a store and pause the component instead of throwing, and only `escalate` throws to a React error boundary.

## Try them

| Option             | Live demo                                          | Type switches                                                                |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| On an Effect cache | [Try it](./effect-query-boundaries.md#try-it)      | [Change the types](./effect-query-boundaries.md#change-the-types)            |
| Over atoms         | [Try it](./effect-atom-boundaries.md#try-it)       | [The type controls](./effect-atom-boundaries.md#the-type-controls)           |
| In raf-query       | [Live demo](./typed-error-boundaries.md#live-demo) | Under the [live demo](./typed-error-boundaries.md#live-demo), beside the app |
