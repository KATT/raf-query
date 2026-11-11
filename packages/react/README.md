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

One function makes the app's query client, and one file binds the builders to it, so queries take the options of the client's plugins:

```tsx
// raf.ts
import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	recommended,
} from "@raf-query/react";

export const makeQueryClient = () =>
	createQueryClient({ plugins: recommended() });

export const queryOptions = bindQueryOptions<typeof makeQueryClient>();
export const infiniteQueryOptions =
	bindInfiniteQueryOptions<typeof makeQueryClient>();
```

A query is a factory. The loader and the component call the same one. A paged list, such as comments, uses `infiniteQueryOptions`.

```tsx
import { group } from "@raf-query/react";

import { infiniteQueryOptions, queryOptions } from "./raf.ts";

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
			post: swr(postQuery, { slug }),
			comments: prefetch(commentsQuery, { slug }),
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

| Import                             | Use                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/react`                 | `QueryClientProvider`, `useQuery`, `useInfiniteQuery`, `useIsFetching`, `HydrationBoundary`, `QueryDevtools`, and all of core (`createQueryClient`, the binders, `group`, `dehydrate`, `hydrate`); what an app doesn't import stays out of its bundle |
| `@raf-query/react/tanstack-router` | [TanStack Start and Router](https://raf-query.katt.dev/docs/tanstack-start) SSR streaming                                                                                                                                                             |

## License

MIT
