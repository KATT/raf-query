---
title: Infinite queries
description: Paged queries with infiniteQueryOptions, "load more" buttons, infinite scroll, bidirectional lists and maxPages.
section: Guides
order: 10
---

Lists that load more data onto what's already shown, such as "load more" buttons and infinite scroll, are a common UI pattern. A paged factory returns `infiniteQueryOptions(...)`; everything else uses the same `useQuery` and the same verbs as any query.

```ts title="src/queries.ts"
export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: ["comments", input.slug],
		queryFn: (context) =>
			listComments({ slug: input.slug, cursor: context.pageParam }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

- `initialPageParam` is the first page's param.
- `getNextPageParam(lastPage, pages, lastPageParam, pageParams)` returns the next page's param, or `null` / `undefined` when there are no more pages.
- The `queryFn` receives the param as `context.pageParam`.

## Reading pages

With a paged factory, `useQuery` returns the same tuple. The promise resolves to `{ pages, pageParams }`, and the controls add paging:

```tsx twoslash
import { type QueryHandle, useQuery } from "@raf-query/react";
import { use } from "react";
import { commentsQuery, type PostComment } from "./_twoslash.ts";
declare function Comment(props: PostComment): React.ReactNode;
// ---cut---
function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesPromise, comments] = useQuery(commentsQuery, props.handle);
	const data = use(pagesPromise);
	//    ^?

	return (
		<>
			{data.pages
				.flatMap((page) => page.items)
				.map((comment) => (
					<Comment key={comment.id} {...comment} />
				))}
			<button
				disabled={!comments.hasNextPage || comments.isFetchingNextPage}
				onClick={() => comments.fetchNextPage()}
			>
				Load more
			</button>
		</>
	);
}
```

| Control                                        | Meaning                                      |
| ---------------------------------------------- | -------------------------------------------- |
| `fetchNextPage()`, `fetchPreviousPage()`       | Load a page at either end; returns a promise |
| `hasNextPage`, `hasPreviousPage`               | Whether the page param functions found one   |
| `isFetchingNextPage`, `isFetchingPreviousPage` | A page is loading at that end                |

They exist only on the type for paged factories.

## Infinite scroll

Infinite scroll is the same paged query with an automatic "Load more". A ref callback watches the button and presses it when it nears the viewport. Unmount the button while a page loads: it watches again when it remounts, so it keeps loading while it stays in reach. Its place is taken by skeletons the size of the incoming page, so the loaded rows replace them without moving anything below.

```tsx
{
	comments.isFetchingNextPage ? <CommentSkeletons /> : null;
}
{
	comments.hasNextPage && !comments.isFetchingNextPage ? (
		<button
			onClick={() => comments.fetchNextPage()}
			ref={(button) => {
				if (button === null) return;
				const observer = new IntersectionObserver(
					(entries) => {
						if (entries.some((entry) => entry.isIntersecting)) {
							observer.disconnect();
							comments.fetchNextPage();
						}
					},
					{ rootMargin: "0px 0px 300px 0px" },
				);
				observer.observe(button);
				return () => observer.disconnect();
			}}
		>
			Load more
		</button>
	) : null;
}
```

Scroll the feed below. Switch the filter to see a new list start from its first page, and switch back to find the old one still cached, with every page you loaded.

```demo
infinite-scroll
```

## Loading several pages up front

On the server, `ensure` and `fetch` load the first page. Pass `{ pages: n }` as a third argument to load more:

```ts
const comments = await qc.ensure(commentsQuery, { slug }, { pages: 2 });
```

The option is only accepted for paged factories.

## Refetching

When a paged query refetches — stale on navigation, invalidated, focused — every loaded page is refetched **in order**, starting from the first, so cursors stay consistent: page two's param is recomputed from the new page one.

## Bidirectional lists

Add `getPreviousPageParam` to load pages before the first one, for a chat log that starts in the middle:

```ts
infiniteQueryOptions({
	queryKey: ["messages", input.channel],
	queryFn: (context) =>
		listMessages({ channel: input.channel, cursor: context.pageParam }),
	initialPageParam: input.around,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
	getPreviousPageParam: (firstPage) => firstPage.previousCursor,
});
```

`context.direction` tells the `queryFn` which end it's loading.

## Limiting pages with maxPages

Long sessions can accumulate many pages. `maxPages` keeps at most that many: when a new page is added, the page at the far end is dropped. Refetches then load fewer pages, too. With `maxPages`, define both `getNextPageParam` and `getPreviousPageParam`, so a dropped page can be loaded again when the user scrolls back.

## Changing the input

Pages belong to one input. A filter or sort in the URL changes the input, and with it the key, so a new list starts from its first page. The old list stays cached under its own key until `gcTime`, which is why switching back is instant.
