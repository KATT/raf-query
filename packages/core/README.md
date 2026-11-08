# @raf-query/core

The framework-agnostic query client behind [raf-query](https://raf-query.katt.dev): a small cache that dedupes requests, keeps entries fresh, and hands out serializable handles. Retries, timeouts, refetch on focus or reconnect, polling and hydration are opt-in links, features and exports, so a client bundles only what it turns on.

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
	createQueryClient,
	group,
	invalidateOne,
	load,
	queryOptions,
	retry,
	revalidate,
} from "@raf-query/core";

const issues = group("issues");

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: issues("byId", input.id),
		queryFn: () => getIssue(input.id),
	});
}

const queryClient = createQueryClient({ links: [retry()], staleTime: 5000 });

const [, data] = await load(queryClient, {
	issue: revalidate(issueQuery, { id: 1 }),
});
console.log(data.issue.title);

await invalidateOne(queryClient, issueQuery, { id: 1 });
```

## Entry points

| Import            | Use                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@raf-query/core` | `createQueryClient`, query factories, `load`, the verbs, the built-in links and features, `group`, `dehydrate` and `hydrate` |

## License

MIT
