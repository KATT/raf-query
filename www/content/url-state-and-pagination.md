---
title: Pagination and URL state
description: Put filters, sort and page in the URL, let the loader turn them into the query's input, and pick what shows while the new input loads with whilePending.
section: Guides
order: 11
---

Filters, sort order and pagination are search params. The loader or server component turns them into the query's input, so every navigation starts the right query, and the component only ever reads the handle it was given:

```sample framework="tanstack-start"
tanstack-start/src/routes/posts.tsx#route
```

```sample framework="nextjs"
nextjs/src/app/(blog)/posts/page.tsx#page
```

```sample framework="nextjs"
nextjs/src/app/(blog)/components/posts.tsx#component
```

```sample framework="react-router"
react-router/app/routes/posts.tsx#route
```

Clicking a link navigates, the loader or server component starts the new URL's input with `prefetch`, and the component receives a new handle.

## What shows while the new input loads

That's up to `useQuery`'s `whilePending` option:

| `whilePending`        | While the new input loads                                                                                                                                  | Use for                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `"suspend"` (default) | `use()` suspends. Routers that navigate in a React transition keep the whole previous screen, old URL included, until the data arrives                     | Short loads, and pages that shouldn't show stale data         |
| `"previous"`          | The navigation commits immediately. `useQuery` keeps returning the previous input's data, and `isPrevious` is `true` on its state until the new data lands | Lists, filters, pagination: anything that should feel instant |

Either way, an input that's already cached renders immediately. A component that mounts with a pending handle has no previous data, so `"previous"` suspends like `"suspend"` on first load.

Page through the demo with each mode. Watch the address bar: with `"suspend"` it waits for the data, with `"previous"` it updates at once and the old page dims. Hovering **Next** prefetches the next page, so with a bit of patience neither mode waits.

```demo
pagination
```

`"previous"` covers what TanStack Query's [`placeholderData: keepPreviousData`](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries#better-paginated-queries-with-placeholderdata) and `isPlaceholderData` do.

## Skeletons for unrelated content

To show a skeleton instead, for instance when moving between unrelated posts, give the Suspense boundary the query's key. React treats it as new content and shows its fallback, even inside a transition:

```sample
tanstack-start/src/docs/url-state-and-pagination.tsx#skeletons-for-unrelated-content
```

`hash` on the state is the stable string form of the query's key.

## Input typed before it reaches the URL

A search box changes the input on every keystroke, faster than navigations should run. Keep what's being typed in state, and derive the reader's handle from the loader's with `waterfallHandle(factory, handle, update)`. `update` gets the handle's input and returns the new one:

```sample
tanstack-start/src/docs/url-state-and-pagination.tsx#input-typed-before-the-url
```

While `q` is still the URL's, the new input maps to the same query, so `waterfallHandle` returns the loader's handle itself and `useQuery` reads it as before. Each new `q` is a query no loader started: the component fetches it while rendering, a [request waterfall](./request-waterfalls.md#render-time-inputs-waterfallhandle) the name keeps visible. Write the term to the URL when the user submits or pauses, so the next loader starts it and links share it.

## Pagination versus infinite scroll

They differ in where the page lives:

- **Pagination**: the page is a search param and part of the input, so each page is its own query and the URL links to it.
- **Infinite scroll**: filters and sort are search params, and pages are loaded into one paged query per input with `infiniteQueryOptions`, read with `useInfiniteQuery` and extended with `fetchNextPage`. Changing a filter starts a new list from its first page. See [Infinite queries](./infinite-queries.md).

## Why not local state?

It's tempting to keep the page number in `useState` and build the input from it. Don't: the loader can't see component state, so the query would start only after render, the back button wouldn't restore the page, and a shared link would open page one. Keeping the input in the URL makes every view linkable and every query startable before render.
