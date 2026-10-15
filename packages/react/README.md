# @raf-query/react

Render-as-you-fetch data fetching for React: start queries in route loaders and server components, pass serializable handles to components, and read them with `use()` under Suspense.

**[Documentation](https://raf-query.katt.dev)** · [Quick start](https://raf-query.katt.dev/docs/quick-start) · [API reference](https://raf-query.katt.dev/docs/api-reference) · [GitHub](https://github.com/KATT/raf-query)

> [!WARNING]
> raf-query is early. The API can still change between patch releases, and you use it at your own risk.

## Install

```bash
npm install @raf-query/react effect
```

Apps never import `effect` unless they write Effect code. Requires React 19.2 or newer.

## Usage

A query is a factory. The loader and the component call the same one.

```tsx
import { queryOptions } from "@raf-query/react";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}
```

**`prefetch`** starts the request and returns a handle at once. The page renders now; `use()` suspends whatever is still loading, under its Suspense fallback.

```tsx
import { useQuery } from "@raf-query/react";
import { Suspense, use } from "react";

export const Route = createFileRoute("/posts/$slug")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		return {
			comments: qc.prefetch(commentsQuery, { slug }),
			post: qc.prefetch(postQuery, { slug }),
		};
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	const [post] = useQuery(postQuery, data.post);
	return (
		<article>
			<h1>{use(post).title}</h1>
			<Suspense fallback={<CommentsSkeleton />}>
				<Comments handle={data.comments} />
			</Suspense>
		</article>
	);
}
```

**`ensure`** waits until the data is cached, so the navigation holds and `useQuery` returns the data itself. Await several with [`allKeyed`](https://raf-query.katt.dev/docs/starting-queries#awaiting-several-queries) — a record of promises in, the same record out — so one wait never delays the others.

```tsx
import { allKeyed, useQuery } from "@raf-query/react";

export const Route = createFileRoute("/posts/$slug")({
	loader: (args) => {
		const qc = args.context.queryClient;
		const { slug } = args.params;
		return allKeyed({
			author: qc.ensure(authorQuery, { id: slug }),
			post: qc.ensure(postQuery, { slug }),
		});
	},
	component: PostPage,
});

function PostPage() {
	const data = Route.useLoaderData();
	// ensure put the post in the cache, so this is the post itself.
	const [post] = useQuery(postQuery, data.post);
	return <h1>{post.title}</h1>;
}
```

## Entry points

| Import                             | Use                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@raf-query/react`                 | `QueryClient`, `QueryClientProvider`, `useQuery`, `useWaterfall`, `useIsFetching`, and all of core |
| `@raf-query/react/tanstack-router` | [TanStack Start and Router](https://raf-query.katt.dev/docs/tanstack-start) SSR streaming          |
| `@raf-query/react/rsc`             | [React Server Components](https://raf-query.katt.dev/docs/nextjs), such as the Next.js App Router  |
| `@raf-query/react/devtools`        | The [devtools](https://raf-query.katt.dev/docs/devtools) panel; omit the element to tree-shake it  |

## License

MIT
