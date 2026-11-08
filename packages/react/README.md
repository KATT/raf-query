# @raf-query/react

Render-as-you-fetch data fetching for React: start queries in route loaders and server components, pass serializable handles to components, and read them with `use()` under Suspense.

**[Documentation](https://raf-query.katt.dev)** · [Quick start](https://raf-query.katt.dev/docs/quick-start) · [API reference](https://raf-query.katt.dev/docs/api-reference) · [GitHub](https://github.com/KATT/raf-query)

> [!NOTE]
> raf-query is early. The API can still change between minor releases, and you use it at your own risk.

## Install

```bash
npm install @raf-query/react
```

Requires React 19.2 or newer.

## Usage

A query is a factory. The loader and the component call the same one. A paged list, such as comments, uses `infiniteQueryOptions`.

```tsx
import { group, infiniteQueryOptions, queryOptions } from "@raf-query/react";

const posts = group("posts");
const comments = group(posts, "comments");

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: posts("bySlug", input.slug),
		queryFn: () => getPost(input.slug),
	});
}

export function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		queryKey: comments(input.slug),
		queryFn: (context) =>
			listComments({ cursor: context.pageParam, slug: input.slug }),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
	});
}
```

A loader names its queries in one `load` call. **`prefetch`** starts a request without waiting for it: the page renders now, and `use()` suspends whatever is still loading under its Suspense fallback. **`swr`** holds the navigation until the data is cached, so `use()` returns it without suspending. `useQuery` returns a thenable for every handle, because the cache can drop a query between the loader and the render.

```tsx
import {
	load,
	prefetch,
	type QueryHandle,
	swr,
	useInfiniteQuery,
	useQuery,
} from "@raf-query/react";
import { Suspense, use } from "react";

export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => {
		const { slug } = args.params;
		const [handles] = await load(args.context.queryClient, {
			comments: prefetch(commentsQuery, { slug }),
			post: swr(postQuery, { slug }),
		});
		return handles;
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	const [postThenable] = useQuery(postQuery, data.post);
	// The loader waited for it, so this doesn't suspend.
	const post = use(postThenable);
	return (
		<article>
			<h1>{post.title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}

function Comments(props: { handle: QueryHandle<typeof commentsQuery> }) {
	const [pagesThenable] = useInfiniteQuery(commentsQuery, props.handle);
	const pages = use(pagesThenable);
	return pages.pages
		.flatMap((page) => page.items)
		.map((comment) => (
			<p key={comment.id}>
				<strong>{comment.author}</strong> {comment.body}
			</p>
		));
}
```

## Entry points

| Import                             | Use                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/react`                 | `QueryClientProvider`, `QueryProvider`, `useQuery`, `useInfiniteQuery`, `useIsFetching`, `HydrationBoundary`, and all of core |
| `@raf-query/react/hydration`       | `dehydrate` and `hydrate` from core                                                                                           |
| `@raf-query/react/groups`          | `tag` and `groups()` from core                                                                                                |
| `@raf-query/react/tanstack-router` | [TanStack Start and Router](https://raf-query.katt.dev/docs/tanstack-start) SSR streaming                                     |
| `@raf-query/react/devtools`        | The [devtools](https://raf-query.katt.dev/docs/devtools) panel; omit the element to tree-shake it                             |

## License

MIT
