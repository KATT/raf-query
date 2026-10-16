# @raf-query/vue

Render-as-you-fetch data fetching for Vue: start queries in route guards, loaders or on the server, pass serializable handles to components, and read them with `useQuery`.

**[Documentation](https://raf-query.katt.dev/docs/vue)** · [API reference](https://raf-query.katt.dev/docs/api-reference#raf-queryvue) · [GitHub](https://github.com/KATT/raf-query)

> [!WARNING]
> `@raf-query/vue` is experimental. Its API can change in any release, and it isn't used in production yet.

## Install

```bash
npm install @raf-query/vue effect
```

Apps never import `effect` unless they write Effect code. Requires Vue 3.5 or newer.

## Usage

A query is a factory. Whatever starts the query and the component that reads it call the same one.

```ts
import { QueryClient, QueryPlugin, queryOptions } from "@raf-query/vue";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
	});
}

createApp(App).use(QueryPlugin, { client: new QueryClient() }).mount("#app");
```

**`prefetch`** starts the request and returns a handle at once. `useQuery` reads it: `data` is `undefined` until the request settles.

```vue
<script setup lang="ts">
import { type QueryHandle, useQuery } from "@raf-query/vue";

const props = defineProps<{ post: QueryHandle<typeof postQuery> }>();
const post = useQuery(postQuery, () => props.post);
</script>

<template>
	<h1 v-if="post.data">{{ post.data.title }}</h1>
	<p v-else>Loading…</p>
</template>
```

Under `<Suspense>`, `await post.promise` in `<script setup>`, and `data` is there on the first render and in the server's HTML. A handle from **`ensure`** or **`fetch`** already holds its data, so `data` is never `undefined` for it.

## License

MIT
