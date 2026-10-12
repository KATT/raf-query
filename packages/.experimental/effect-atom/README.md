# @raf-query/experimental-effect-atom

> **Experiment. Private, and not published to npm.** It lives in this repo to try a third way of building raf-query. Its API can change or go away at any time. It stays at version `0.0.0`, and releases skip it.

This package gives you raf-query's render-as-you-fetch API with every query held as atoms in an [`effect/reactivity`](../../../.repos/effect/packages/effect/src/reactivity/) `AtomRegistry`. The published packages, `@raf-query/core` and `@raf-query/react`, run on raf-query's own cache instead. The [root README](../../../README.md) explains the API in full: handles, `use()`, mutations with Actions. This page covers what is different here, and what is missing.

`effect/reactivity` is marked unstable in Effect 4, so this package can break on any Effect upgrade.

To try it, depend on it from inside this workspace:

```json
{
	"dependencies": {
		"@raf-query/experimental-effect-atom": "workspace:*"
	}
}
```

## What it is

Everything below the React hooks is Effect:

- **`QueryCache`** is an Effect service. Its verbs return Effects, and `QueryCache.layer()` builds it over an `AtomRegistry`.
- **A `queryFn` can need services.** Its Effect's requirements show up in the type of every verb that can start it. `cache.fetch(issueQuery, input)` is an `Effect<Issue, NotFound, IssueApi>`. The request runs with the services the cache was built with, plus those of the verb that last started it.
- **Requests are traced and report defects.** Each request runs in a `raf-query.request` span, and a `queryFn` that dies is logged with `Effect.logError`. Typed failures stay typed: `Effect.flip(cache.ensure(...))` gives you the `NotFound`.
- **Queries are atoms.** `cache.atom(factory, input)` is an `Atom<AsyncResult<Data, Error>>` that other atoms can read and `AtomRegistry.getResult` can wait on.

React gets a thin edge:

- **`QueryClient`** runs the cache's Effects as Promises for loaders and event handlers. `new QueryClient({ layer })` builds the services for queries' Effects, and only factories whose services are in that layer type-check. `client.dispose()` runs the layer's finalizers. `client.effect` is the `QueryCache`.
- **`useQuery`** subscribes to the query's atom. It returns a stable thenable for `use()`, and its controls include the atom's `AsyncResult` (`controls.result`). You can render that with `AsyncResult.match` instead of suspending, or match on its `Cause`.

```ts
import { QueryCache, queryOptions } from "@raf-query/experimental-effect-atom";
import { Effect, Layer } from "effect";
import { AtomRegistry } from "effect/reactivity";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
	});
}

// Effect: Effect<Issue, NotFound, IssueApi | QueryCache.QueryCache>
const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	return yield* cache.fetch(issueQuery, { id: 1 });
});

const layer = QueryCache.layer().pipe(
	Layer.provideMerge(Layer.merge(AtomRegistry.layer, IssueApi.layer)),
);
```

```tsx
// React: the client provides IssueApi to every query it starts.
const client = new QueryClient({ layer: IssueApi.layer });

export const loader = () => ({ issue: client.prefetch(issueQuery, { id: 1 }) });

function Issue(props: { handle: QueryHandle<typeof issueQuery> }) {
	const [promise, state] = useQuery(issueQuery, props.handle);
	const issue = use(promise);
	// state.result: AsyncResult<Issue, NotFound>
}
```

## How a query maps onto atoms

Each query hash gets two atoms:

| Query concept            | Atom building block                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Cache                    | An `AtomRegistry`                                                                                                      |
| Request                  | `Atom.make(effect)`: the `queryFn`, retried per `retry` / `retryDelay`. Its fiber is interrupted on refresh or dispose |
| State                    | `AsyncResult`: `Initial` / `Success` / `Failure`, with `waiting` while a request runs                                  |
| `setData`                | The data atom is `Atom.writable`; writing sets an `AsyncResult.success`                                                |
| `gcTime`                 | `Atom.setIdleTTL(gcTime)` on the data atom                                                                             |
| `staleTime`, focus       | `Atom.swr({ staleTime, revalidateOnFocus, focusSignal })` over the data atom; that view is what `useQuery` reads       |
| `refetchOnReconnect`     | An `online` signal atom, combined with `Atom.windowFocusSignal` as the `swr` focus signal                              |
| `refetch` / read queries | `registry.refresh(dataAtom)`                                                                                           |
| Waiting for a request    | `AtomRegistry.getResult(registry, dataAtom, { suspendOnWaiting: true })`                                               |
| Paged requests           | The same request atom, rebuilt with a page `command` (next page, previous page, or `{ pages: n }`) the build takes     |
| Hydrated pending query   | The same request atom, rebuilt with the sender's promise in place of the `queryFn`                                     |

Some of a query's state has no place in the registry, so each entry keeps it next to its atoms:

- **An `invalidated` flag.** Refreshing an atom that nothing reads interrupts its request and leaves a stale node that refetches on any read, including `getData`. So `invalidate` refreshes only queries that something reads (a mounted `useQuery`, a suspended one, or another atom). It flags the rest, and their next `prefetch` / `ensure` refetches.
- **The thenables.** React's `use()` needs one promise per data version, already fulfilled when there is data. `AsyncResult`s are new objects whenever `waiting` flips, so the entry hands out a thenable per data value. It also keeps the pending promise for the first load.
- **The services and latest options.** Atoms are built once per hash, so `gcTime`, `staleTime` and the focus settings come from the first factory call. The request reads the latest `queryFn`, retry settings and services each time it runs.
- **What the next build does.** A paged query's `fetchNextPage` sets a page `command`, and `hydrate` sets the sender's promise, right before refreshing the request atom; that build takes them. The page direction stays on the entry for `isFetchingNextPage`.
- **Hydrated queries without an entry.** An entry's atoms need its factory's options, which a dehydrated query doesn't carry. So `hydrate` keeps queries no factory has asked for yet in a preload map, like `AtomRegistry`'s preloaded serializable values, until a factory call creates the entry. A pending one there turns into data if its promise settles first.

## How it differs from `@raf-query/react`

|                     | `@raf-query/react`                                                                   | This package                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Cache               | raf-query's own `QueryCache` service                                                 | `QueryCache` service over an `AtomRegistry`                                                             |
| `queryFn` services  | None: its Effect can't need services                                                 | Typed requirements, provided by the caller or the client's layer                                        |
| Verbs               | `prefetch`, `ensure`, `fetch`, `invalidate`, `setData`, `getData`, `reset`, `remove` | `prefetch`, `ensure`, `fetch`, `invalidate`, `setData`, `getData`, `fetchNextPage`, `fetchPreviousPage` |
| Invalidate a prefix | `qc.invalidate({ queryKey })`                                                        | One query at a time                                                                                     |
| Paged queries       | `infiniteQueryOptions`                                                               | `infiniteQueryOptions`                                                                                  |
| `useQuery` options  | `refetchInterval`, `whilePending`, per-read refetch flags                            | `whilePending`                                                                                          |
| Re-renders          | Only for the controls a component reads                                              | On every change of the query's `AsyncResult`                                                            |
| Focus and reconnect | `QueryClientProvider` mounts the cache's listener                                    | Each read query's `swr` atom listens while it's read                                                    |
| Offline             | Retries wait until the browser is online                                             | Retries run on their schedule                                                                           |
| Structural sharing  | Unchanged data keeps its identity and promise                                        | The same                                                                                                |
| SSR and streaming   | `dehydrate` / `hydrate`, `/next`, `/rsc`, `/tanstack-router`                         | `dehydrate` / `hydrate`, without framework integrations                                                 |
| Devtools            | `@raf-query/react/devtools`                                                          | None                                                                                                    |

## API

- `QueryCache.layer(config?)` and `QueryCache.make(config?)` build the cache in the current `AtomRegistry`. The config takes `defaults` (query behavior such as `staleTime`, `gcTime` and `retry`) and `isServer`, which defaults to `true` when there is no `window`. A server cache doesn't retry, keeps entries until the registry is disposed, refetches only missing data, and skips focus and reconnect refetches.
- The `QueryCache` service has these members:
  - `prefetch` starts a query and succeeds with its handle right away. Fresh data is reused, and stale data refetches in the browser.
  - `ensure` waits on a cache miss and succeeds with an `ensured` handle. `fetch` is the same but succeeds with the data. Both fail with the `queryFn`'s error. For a paged factory, `{ pages: n }` after the input loads `n` pages on a miss.
  - `fetchNextPage` and `fetchPreviousPage` add a page to a paged query once the request in flight settles. They never fail.
  - `invalidate` refetches the query if something reads it and waits for that. Otherwise it marks the query stale.
  - `setData` and `getData` write and read the cached data without fetching.
  - `atom` returns the query's atom.
  - `dehydrate` snapshots settled data, and the promises of first loads still in flight. `hydrate` writes a snapshot: data replaces only older data, and a pending query resumes the sender's promise instead of fetching.
- `new QueryClient({ layer?, registry?, defaults?, isServer? })` runs the same verbs as Promises (`ensure`, `fetch`, `invalidate`, `fetchNextPage`, `fetchPreviousPage`) or synchronously (`prefetch`, `setData`, `getData`). It also has `atom`, `effect`, `registry` and `dispose()`. Its layer must build synchronously. `dehydrate(client, options?)` and `hydrate(client, state, options?)` run the cache's.
- `useQuery(factory, handle, { whilePending? })` returns `[promise, controls]`, or `[data, controls]` for an ensured handle. The controls are `error`, `hash`, `input`, `isFetching`, `isPending`, `isPrevious`, `isStale`, `key`, `refetch`, `result` and `updatedAt`; paged factories add `fetchNextPage`, `fetchPreviousPage`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage` and `isFetchingPreviousPage`. With `whilePending: "previous"`, a query without data shows the data the component last showed, with `isPrevious`.
- `QueryClientProvider` and `useQueryClient`.
