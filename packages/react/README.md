# @raf-query/react

Render-as-you-fetch data fetching for React: start queries in route loaders and server components, pass serializable handles to components, and read them with `use()` under Suspense.

**[Documentation](https://raf-query.katt.dev)** · [Quick start](https://raf-query.katt.dev/docs/quick-start) · [API reference](https://raf-query.katt.dev/docs/api-reference) · [GitHub](https://github.com/KATT/raf-query)

> [!WARNING]
> raf-query is early. The API can still change between patch releases, and you use it at your own risk.

## Install

```bash
npm install @raf-query/react
```

`effect` is a peer dependency. npm, pnpm and Bun install it for you; with Yarn, run `yarn add @raf-query/react effect`. Apps never import it unless they write Effect code. Requires React 19.2 or newer.

## Usage

```tsx
import { queryOptions, useQuery } from "@raf-query/react";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

// The loader starts the query and passes a handle on…
export const Route = createFileRoute("/posts/$slug")({
	loader: async (args) => ({
		post: await args.context.queryClient.ensure(postQuery, {
			slug: args.params.slug,
		}),
	}),
	component: PostPage,
});

// …and the component reads it.
function PostPage() {
	const [post] = useQuery(postQuery, Route.useLoaderData().post);
	return <h1>{post.title}</h1>;
}
```

## Entry points

| Import                             | Use                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@raf-query/react`                 | `QueryClient`, `QueryClientProvider`, `useQuery`, `useWaterfall`, `useIsFetching`, and all of core |
| `@raf-query/react/tanstack-router` | [TanStack Start and Router](https://raf-query.katt.dev/docs/tanstack-start) SSR streaming          |
| `@raf-query/react/rsc`             | [React Server Components](https://raf-query.katt.dev/docs/nextjs), such as the Next.js App Router  |
| `@raf-query/react/react-router`    | [React Router](https://raf-query.katt.dev/docs/react-router) Framework Mode loaders                |
| `@raf-query/react/devtools`        | The [devtools](https://raf-query.katt.dev/docs/devtools) panel; omit the element to tree-shake it  |

## License

MIT
