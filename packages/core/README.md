# @raf-query/core

The framework-agnostic query client behind [raf-query](https://raf-query.katt.dev): a small cache that dedupes requests, keeps entries fresh, and hands out serializable handles. Retries, timeouts, refetch on focus or reconnect, polling and hydration are opt-in, as plugins you give the client or exports you import, so a client bundles only what it turns on.

**[Documentation](https://raf-query.katt.dev)** · [API reference](https://raf-query.katt.dev/docs/api-reference#raf-querycore) · [GitHub](https://github.com/KATT/raf-query)

> [!NOTE]
> raf-query is early. The API can still change between minor releases, and you use it at your own risk.

React apps install [`@raf-query/react`](https://www.npmjs.com/package/@raf-query/react) instead: it re-exports this package, so you never import core directly. Install core on its own for scripts, tests and bindings to other frameworks.

## Install

```bash
npm install @raf-query/core
```

## Usage

```ts
import {
	bindQueryOptions,
	createQueryClient,
	group,
	invalidateOne,
	load,
	retry,
	revalidate,
} from "@raf-query/core";

const makeQueryClient = () =>
	createQueryClient({
		plugins: [retry()],
		defaults: { staleTime: 5000 },
	});

// Bound to the client, once: queries take the options its plugins declare.
const queryOptions = bindQueryOptions<typeof makeQueryClient>();

const issues = group("issues");

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: issues("byId", input.id),
		queryFn: () => getIssue(input.id),
		retry: 1,
	});
}

const queryClient = makeQueryClient();

const [, data] = await load(queryClient, {
	issue: revalidate(issueQuery, { id: 1 }),
});
console.log(data.issue.title);

await invalidateOne(queryClient, issueQuery, { id: 1 });
```

## Entry points

| Import            | Use                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/core` | `createQueryClient`, the binders that make `queryOptions` and `infiniteQueryOptions`, `load`, the verbs, the built-in plugins (`retry()`, `polling()` and so on), `group`, `dehydrate` and `hydrate` |

## License

MIT
