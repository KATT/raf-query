---
title: Infinite queries
description: Paged queries with infiniteQueryOptions, "load more" buttons, infinite scroll, bidirectional lists and maxPages.
section: Guides
order: 10
---

Lists that load more data onto what's already shown, such as "load more" buttons and infinite scroll, are a common UI pattern. A paged factory returns `infiniteQueryOptions(...)`, and components read it with `useInfiniteQuery`. Loaders and verbs take it like any query.

```sample title="src/queries.ts"
tanstack-start/src/docs/infinite-queries.ts#intro
```

- `comments` is a [group](./query-keys.md#groups): it builds every comments key.
- `initialPageParam` is the first page's param.
- `getNextPageParam(lastPage, pages, lastPageParam)` returns the next page's param, or `null` / `undefined` when there are no more pages.
- The `queryFn` receives the param as `context.pageParam`, next to `signal`.

## Reading pages

`useInfiniteQuery(factory, handle, options?)` returns the same `[thenable, state]` tuple as [`useQuery`](./reading-queries.md), with the same options. The data is `{ pages, pageParams }`, and the state adds paging:

```sample
tanstack-start/src/docs/infinite-queries.tsx#reading-pages
```

| Control                                        | Meaning                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| `fetchNextPage()`, `fetchPreviousPage()`       | Load a page at either end; resolves when it's there |
| `hasNextPage`, `hasPreviousPage`               | Whether the page param functions found one          |
| `isFetchingNextPage`, `isFetchingPreviousPage` | A page is loading at that end                       |

`useInfiniteQuery` takes only paged factories, and `useQuery` only factories that aren't: passing the other kind is a type error. The paging code is in `useInfiniteQuery` alone, so an app that never pages doesn't ship it.

## Infinite scroll

Infinite scroll is the same paged query with an automatic "Load more". A ref callback watches the button with an [`IntersectionObserver`](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver) and presses it when it nears the viewport. Unmount the button while a page loads: it watches again when it remounts, so it keeps loading while it stays in reach. Its place is taken by skeletons the size of the incoming page, so the loaded rows replace them without moving anything below.

```sample
tanstack-start/src/docs/infinite-queries.tsx#infinite-scroll
```

Scroll the feed below. Switch the filter to see a new list start from its first page, and switch back to find the old one still cached, with every page you loaded.

```demo
infinite-scroll
```

## Loading several pages up front

A loader's `swr` and `revalidate` load the first page. Pass `{ pages: n }` after the input to load more:

```sample
tanstack-start/src/docs/infinite-queries.loading-several-pages-up-front.ts#loading-several-pages-up-front
```

The option only changes a first load: a query that already has pages keeps the ones it has.

## Refetching

When a paged query refetches (invalidated, refetched on focus, stale in a loader), every loaded page is refetched **in order**, starting from the first, so cursors stay consistent: page two's param is recomputed from the new page one. A refetch stops early if `getNextPageParam` finds no more pages.

Loading a page starts from the data as it was when the request started, and replaces the data when the page arrives.

## Bidirectional lists

Add `getPreviousPageParam(firstPage, pages, firstPageParam)` to load pages before the first one, for a chat log that starts in the middle:

```sample
tanstack-start/src/docs/infinite-queries.ts#bidirectional-lists
```

`context.direction` tells the `queryFn` which way it's loading: `"backward"` for a page before the first, `"forward"` otherwise.

## Limiting pages with maxPages

Long sessions can accumulate many pages. `maxPages` keeps at most that many: when a new page is added, the page at the far end is dropped. Refetches then load fewer pages, too. With `maxPages`, define both `getNextPageParam` and `getPreviousPageParam`, so a dropped page can be loaded again when the user scrolls back.

## Changing the input

Pages belong to one input. A filter or sort in the URL changes the input, and with it the key, so a new list starts from its first page. The old list stays cached under its own key until `gcTime`, which is why switching back is instant. See [URL state and pagination](./url-state-and-pagination.md).
