---
title: Infinite queries
description: Paged queries with infiniteQueryOptions, "load more" buttons, infinite scroll, bidirectional lists, lists opened at an item and maxPages.
section: Guides
order: 12
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

Scroll the comments below. Switch the filter to see a new list start from its first page, and switch back to find the old one still cached, with every page you loaded.

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

Pages written with [`setData`](./mutations.md#updates-from-mutation-responses) while a request runs stay, so a live source that writes the pages it has loaded (a subscription per page) doesn't have to send them again after every load:

- `fetchNextPage()` and `fetchPreviousPage()` add the new page to the data as it is when the page arrives. If a write moved the end the page was loaded for, the write wins and the page is dropped.
- A refetch keeps a page written after that page's read started. A page written before its read started is read again, and the read wins.

## Bidirectional lists

Add `getPreviousPageParam(firstPage, pages, firstPageParam)` to load pages before the first one, for a comment thread opened at a linked comment, which starts in the middle:

```sample
tanstack-start/src/docs/infinite-queries.ts#bidirectional-lists
```

`context.direction` tells the `queryFn` which way it's loading: `"backward"` for a page before the first, `"forward"` otherwise.

## Opening at an item

With the linked comment in the key, every link is its own list. Following a link to a comment the page already shows then starts a new list there, and the pages the reader scrolled through are gone. To keep them, leave the comment out of the key and let `keepPages` say when the cached list still suits the link:

```sample
tanstack-start/src/docs/infinite-queries.ts#opened-at-an-item
```

Every link now shares one entry, which keeps the `initialPageParam` it was first loaded with: refetches and new pages grow from there. `load` asks `keepPages(data)` before it uses the cached pages. On `true` it uses them as they are, so moving between comments on screen, or back and forward, reads nothing. On `false` it drops them, and the list loads again from this link's `initialPageParam`. Readers never ask, so a list doesn't start over under someone reading it.

## Limiting pages with maxPages

Long sessions can accumulate many pages. `maxPages` keeps at most that many: when a new page is added, the page at the far end is dropped. Refetches then load fewer pages, too. With `maxPages`, define both `getNextPageParam` and `getPreviousPageParam`, so a dropped page can be loaded again when the user scrolls back.

## Outside React

Scripts, tests and bindings to other frameworks page with verbs that take the client first, like the hook's controls:

```sample
tanstack-start/src/docs/infinite-queries.outside-react.ts#outside-react
```

`fetchNextPage(client, factory, input)` and `fetchPreviousPage(…)` resolve when the page is there, or the request settles. Without a page at that end, they do nothing. An error is in the query's state, as with the hook. `hasNextPage(client, factory, input)` and `hasPreviousPage(…)` say whether there is a page at that end.

Paging lives in `@raf-query/core`: `useInfiniteQuery`'s controls are core's `PageControls`, the same requests and the same state these verbs read.

## Changing the input

Pages belong to one key. A filter or sort in the URL changes the input, and with it the key, so a new list starts from its first page. The old list stays cached under its own key until `gcTime`, which is why switching back is instant. See [URL state and pagination](./url-state-and-pagination.md).
