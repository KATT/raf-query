# raf-query

The idea of this library is to have a simple query library for React that ensures that data is fetched in loaders or in RSC components.

It's a libray built on modern react, leveraging Suspense and `use()`.

Most data fetching in apps should be done in loaders or in RSC components, `useQuery()` is a modern anti-pattern that encourages people to fetch as you render.

Heavily inspired by tanstack-query. We should copy mechanisms from there

Also see how prefetching works in <https://github.com/KATTCORP/isbabyoutyet/tree/main/projects/isbabyoutyet>

## Examples

We should have two simple examples that that showcases the library

- examples/nextjs
- examples/tanstack-start

Next.js should be RSC driven for data fetching but fetching in components should be supported and components should be able to fetch data and render it.

## Usage sketches

You don't have to implement it exactly like this

```tsx
import { queryOptions, infiniteQueryOptions } from "raf-query";

function fetchPost(opts: { slug: string }) {
	return queryOptions({
		queryFn: async () => {
			// ....
		},
	});
}

function fetchComments(opts: { slug: string }) {
	return infiniteQueryOptions({
		queryFn: async () => {
			// ....
		},
	});
}

// tanstack start example
export const Route = createFileRoute("/posts/$slug")({
	component: PostPage,
	loader: async (opts) => {
		const { queryClient } = opts.context;
		const slug = opts.params.slug;

		const loaderData = await allKeyed({
			post: queryClient.ensureQueryData(fetchPost, {
				slug: publicId,
			}),
			comments: queryClient.ensureInfiniteQueryData(fetchComments, {
				slug: slug,
			}),
		});

		return loaderData;
	},
});

function PostPage() {
	const loaderData = Route.useLoaderData();
}
```
