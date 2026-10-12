"use client";

import type { InputArgs, QueryFactory, QueryHandle } from "@raf-query/core";

import { useQueryClient } from "./provider.tsx";

/**
 * Start a query during render and return its handle, for inputs only known
 * at render time (an id from a parent query's data). Each call is a request
 * waterfall: prefer starting the query in a loader or server component.
 *
 * ```tsx
 * const author = useWaterfall(authorQuery, { id: post.authorId });
 * const [authorPromise] = useQuery(authorQuery, author);
 * ```
 */
export function useWaterfall<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: InputArgs<TFactory>
): QueryHandle<TFactory> {
	const client = useQueryClient();
	const query = client.getQuery(factory, ...args);
	query.read();
	return query.handle;
}
