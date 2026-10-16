# @raf-query/svelte

Render-as-you-fetch data fetching for Svelte: start queries in SvelteKit `load` functions or on the server, pass serializable handles to components, and read them with `useQuery`.

**[Documentation](https://raf-query.katt.dev/docs/svelte)** · [API reference](https://raf-query.katt.dev/docs/api-reference#raf-querysvelte) · [GitHub](https://github.com/KATT/raf-query)

> [!WARNING]
> `@raf-query/svelte` is experimental. Its API can change in any release, and it isn't used in production yet.

## Install

```bash
npm install @raf-query/svelte effect
```

Apps never import `effect` unless they write Effect code. Requires Svelte 5.7 or newer.

## Usage

A query is a factory. Whatever starts the query and the component that reads it call the same one.

```ts
import { queryOptions } from "@raf-query/svelte";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}
```

Provide a client once, in the root layout:

```svelte
<script lang="ts">
	import { QueryClient, QueryClientProvider } from "@raf-query/svelte";

	const { children } = $props();
	const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
```

**`prefetch`** starts the request and returns a handle at once. `useQuery` reads it: `data` is `undefined` until the request settles. Pass the handle as a getter so the component follows new ones.

```svelte
<script lang="ts">
	import { type QueryHandle, useQuery } from "@raf-query/svelte";

	const props: { post: QueryHandle<typeof postQuery> } = $props();
	const post = useQuery(postQuery, () => props.post);
</script>

{#if post.data}
	<h1>{post.data.title}</h1>
{:else}
	<p>Loading…</p>
{/if}
```

A handle from **`ensure`** or **`fetch`**, such as one a server `load` returns, already holds its data, so `data` is never `undefined` for it, and the server's HTML has it.

## License

MIT
