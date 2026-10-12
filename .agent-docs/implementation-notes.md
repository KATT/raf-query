# Implementation notes

Mechanisms the build should copy, each verified against vendored or local source (not memory). Root `README.md` is the spec; this file is how to get there.

## Where each concern lives

| Concern                                                                                                                   | Package                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Cache entries, dedupe, retries, gc, staleness, focus/reconnect managers, infinite paging, invalidation, dehydrate/hydrate | `@raf-query/core`                                                                      |
| Stable thenables per (key, data version)                                                                                  | `@raf-query/core` (React-agnostic: a thenable with `status`/`value` is just an object) |
| Observers, `useSyncExternalStore` subscription, provider, `useWaterfall`                                                  | `@raf-query/react`                                                                     |
| SSR stream glue                                                                                                           | `@raf-query/react/tanstack-router`, `/rsc`, `/next`                                    |

Mirror TanStack's split: `.repos/query/packages/query-core` (no React import anywhere) and `.repos/query/packages/react-query/src/index.ts` (`export * from '@tanstack/query-core'`). Keep `@raf-query/core` free of React types so another binding could sit on it.

## Mechanisms

- **Stable, pre-resolved thenables.** React's `use()` reads synchronously when `thenable.status === "fulfilled"` and only suspends on `"pending"`; it warns about promises created in render (`~/dev/react/packages/react-reconciler/src/ReactFiberThenable.js`). Keep one thenable per (key, data version) and set `status`/`value` on write, so refetches re-render without suspending. TanStack 5.104.1 has no `experimental_prefetchInRender` / `result.promise` anymore, so there's no upstream code to copy for this — design it ourselves.
- **Resuming a streamed promise without refetching.** `hydrate()` calls `query.fetch(undefined, { initialPromise })` for dehydrated pending queries, wrapping in `Promise.resolve(promise)` because "RSC transformed promises are not thenable" (`.repos/query/packages/query-core/src/hydration.ts`). Most of that file is edge cases (newer-data checks, pending-but-resolved, fetchStatus reset) — port them with their tests.
- **Render-phase vs effect-phase hydration.** New entries hydrate in render; existing ones defer to an effect so aborted transitions don't mutate the current page (`.repos/query/packages/react-query/src/HydrationBoundary.tsx`). Applies to our RSC `HydrationBoundary`.
- **TanStack Router SSR stream.** `router.options.dehydrate` returns `{ initial, stream }`; a query-cache subscription enqueues entries as soon as they get a promise, batched per microtask "before React resumes resolved Suspense boundaries"; `onRenderFinished` closes the stream; `serverSsr.onCleanup` calls `queryClient.clear()`. Client side reads the stream and hydrates each chunk (`.repos/router/packages/router-ssr-query-core/src/index.ts`). `setupRouterIntegration` is a port of this.
- **Redirects thrown from queries.** Same file: cache `onError` routes `isRedirect(error)` to `router.navigate(router.resolveRedirect(error).options)`.
- **Next.js SSR-pass stream.** `useServerInsertedHTML` pushes `<script>` chunks after each Suspense boundary; the client drains `window[id]` then swaps in a live `push` (`.repos/query/packages/react-query-next-experimental/src/HydrationStreamProvider.tsx`). Basis for `QueryProvider`.
- **Handle typing.** Branded handle keyed on the factory type; `QueryInputArgs` keeps required inputs required and makes no-arg factories' input optional; `(input: never)`-style constraint rejects 2+ parameter factories. Data type comes from the `DataTag` on `queryKey`, falling back to `queryFn`'s return.

## Open implementation questions

- RSC `HydrationBoundary` dehydrates when it renders, which is before child server components run. Queries those children start need their own boundary (README says so). Check whether passing a `ReadableStream` / async iterable prop through Flight lets one boundary cover a subtree instead.
- Paged and plain queries share every API (verbs, `useQuery`, `useWaterfall`, `setData`). `infiniteQueryOptions` should stamp a runtime marker on the options (don't sniff `getNextPageParam`), and the types branch on a brand from the same function. Keep the conditional return type of `useQuery` readable in hovers and errors — test with `expectTypeOf` on both kinds.
