---
title: Home, step 1
description: The homepage's query factories
section: Project
order: 0
---

```ts twoslash title="src/queries.ts"
import { getPost, listComments } from "./_twoslash.ts";
// ---cut---
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";

export function postQuery(input: { slug: string }) {
	return queryOptions({
		queryKey: ["post", input.slug],
		queryFn: () => getPost(input.slug),
		staleTime: 30_000,
	});
}

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
