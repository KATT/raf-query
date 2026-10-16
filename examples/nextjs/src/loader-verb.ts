import { LoaderVerb } from "@examples/db/types";
import type {
	InputArgs,
	QueryClient,
	QueryFactory,
	QueryHandle,
	QueryHandleWithData,
} from "@raf-query/react";
import { notFound } from "next/navigation";

/** The URL's `[verb]` segment, or the not-found page. */
export function parseLoaderVerb(value: string): LoaderVerb {
	const verb = LoaderVerb.safeParse(value);
	if (!verb.success) {
		notFound();
	}
	return verb.data;
}

/**
 * Starts a query with the verb in the URL. `prefetch` returns the handle at
 * once; `ensure` and `fetch` resolve with a handle that has the data. Await
 * the page's handles together (`allKeyed`) so the queries start together.
 *
 * The server renders every navigation with a new client, so its cache is
 * empty and `ensure` waits as long as `fetch`.
 */
export function startQuery<TFactory extends QueryFactory>(
	queryClient: QueryClient,
	verb: LoaderVerb,
	factory: TFactory,
	...args: InputArgs<TFactory>
): QueryHandle<TFactory> | Promise<QueryHandleWithData<TFactory>> {
	switch (verb) {
		case "prefetch":
			return queryClient.prefetch(factory, ...args);
		case "ensure":
			return queryClient.ensure(factory, ...args);
		case "fetch":
			return queryClient.fetch(factory, ...args);
	}
}
