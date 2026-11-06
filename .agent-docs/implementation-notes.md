# Implementation notes

Mechanisms the build should copy, each verified against vendored or local source (not memory). The docs site's pages (`www/content`) are the spec; this file is how to get there.

## Where each concern lives

| Concern                                                                      | Package                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Entries, dedupe, gc, lazy staleness, infinite paging, streams, `load`, verbs | `@raf-query/core` (`entry.ts`, `client.ts`, `load.ts`, `verbs.ts`)                     |
| Keys, invalidation stamps and targets (the provisional seam)                 | `@raf-query/core` (`keys.ts`; `groups.ts` on the `/groups` subpath)                    |
| Retry and timeout links; focus, reconnect, polling and action features       | `@raf-query/core` (`links.ts`, `features.ts`, `action.ts`), opt-in                     |
| Stable thenables per (key, data version)                                     | `@raf-query/core` (React-agnostic: a thenable with `status`/`value` is just an object) |
| `dehydrate`, `hydrate`, `dehydrateStream`                                    | `@raf-query/core/hydration`, opt-in                                                    |
| `useSyncExternalStore` subscription, providers, `useQuery`, `useIsFetching`  | `@raf-query/react`                                                                     |
| SSR stream glue                                                              | `@raf-query/react/tanstack-router`, `HydrationBoundary`                                |
| `QueryBoundary`                                                              | `@raf-query/boundary`                                                                  |

Mirror TanStack's split: `.repos/query/packages/query-core` (no React import anywhere) and `.repos/query/packages/react-query/src/index.ts` (`export * from '@tanstack/query-core'`). Keep `@raf-query/core` free of React types so another binding could sit on it.

## Mechanisms

- **Stable, pre-resolved thenables.** React's `use()` reads synchronously when `thenable.status === "fulfilled"` and only suspends on `"pending"`; it warns about promises created in render ([`ReactFiberThenable.js` in facebook/react@v19.3.0](https://github.com/facebook/react/blob/v19.3.0/packages/react-reconciler/src/ReactFiberThenable.js)). Keep one thenable per (key, data version) and set `status`/`value` on write, so refetches re-render without suspending. TanStack 5.104.1 has no `experimental_prefetchInRender` / `result.promise` anymore, so there's no upstream code to copy for this — design it ourselves.
- **Resuming a streamed promise without refetching.** `hydrate()` calls `query.fetch(undefined, { initialPromise })` for dehydrated pending queries, wrapping in `Promise.resolve(promise)` because "RSC transformed promises are not thenable" (`.repos/query/packages/query-core/src/hydration.ts`). Most of that file is edge cases (newer-data checks, pending-but-resolved, fetchStatus reset) — port them with their tests.
- **Render-phase vs effect-phase hydration.** New entries hydrate in render; existing ones defer to an effect so aborted transitions don't mutate the current page (`.repos/query/packages/react-query/src/HydrationBoundary.tsx`). Our `Hydrate` (behind `HydrationBoundary`) does the same: entries the client has no data for are written during render, the rest after commit.
- **TanStack Router SSR stream.** `router.options.dehydrate` returns `{ initial, stream }`; a query-cache subscription enqueues entries as soon as they get a promise, batched per microtask "before React resumes resolved Suspense boundaries"; `onRenderFinished` closes the stream; `serverSsr.onCleanup` calls `queryClient.clear()`. Client side reads the stream and hydrates each chunk (`.repos/router/packages/router-ssr-query-core/src/index.ts`). Ported as core's `dehydrateStream` (on the `/hydration` subpath); `setupRouterIntegration` converts it to and from a web `ReadableStream` and hydrates each chunk in the browser.
- **Redirects thrown from queries.** Same file: a cache `updated` event whose error passes `isRedirect(error)` goes to `router.navigate(router.resolveRedirect(error).options)`.
- **Handle typing.** `QueryHandle<TFactory>` carries the factory only as a type-level phantom field; `InputArgs` keeps required inputs required and makes no-arg factories' input optional; `QueryFactory` is a one-parameter method signature (`{ call(input: unknown) }["call"]`, checked bivariantly), so it accepts any one-argument factory and rejects 2+ parameter factories. It isn't `(input: never) => …`: as the verbs' contextual type, `never` made inline generic factory makers (`ensureEntry(makeFactory(x), input)`) infer `never` for their own type parameters. Data comes from the factory's return type (`DataOf`), not a key tag. Two factories are told apart by their types alone, so a handle's `queryKey` keeps the key's literal type (`KeyOf<F>`); see [handle-factory-key-types.md](./decisions/handle-factory-key-types.md). `QueryHandle.input` is `InputOf<TFactory>`, not a conditional on `QueryFactory extends TFactory`: that conditional made TypeScript measure `TFactory` as contravariant, so `QueryHandle<typeof postQuery>` wasn't assignable to `QueryHandle` (an `out` annotation still fails on `InputOf`'s own conditional, but the measured variance is now fine).
- **Paged vs plain.** `infiniteQueryOptions` sets a `~run` function on the options that runs the request page by page; plain queries leave it unset, so the paging code tree-shakes from apps that never import `infiniteQueryOptions`. `expectTypeOf` tests cover both kinds.
- **Requests are promises through links.** Each request runs the client's links around the `queryFn` (`retry()`, `timeout()`), with an `AbortSignal` the entry aborts when nobody reads it any more. A `queryFn` that returns an async iterable is folded into data by its `stream` reducer.
- **Staleness is lazy.** An entry is stale when read if its `staleTime` has passed or a newer invalidation stamp (ordered by the client's sequence number) matches it. Invalidation refetches read entries at once; the rest catch up on their next read. No per-entry timers.

## Open implementation questions

- RSC `HydrationBoundary` dehydrates when it renders, which is before child server components run. Queries those children start need their own boundary (the docs say so). Check whether passing a `ReadableStream` / async iterable prop through Flight lets one boundary cover a subtree instead.
