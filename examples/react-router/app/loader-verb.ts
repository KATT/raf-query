import { DEFAULT_LOADER_VERB, LoaderVerb } from "@examples/db/types";
import type {
	InputArgs,
	QueryClient,
	QueryFactory,
	QueryHandle,
	QueryHandleWithData,
} from "@raf-query/react";
import { useParams } from "react-router";

/** The URL's `:verb` segment, or a 404. */
export function parseLoaderVerb(value: string | undefined): LoaderVerb {
	const verb = LoaderVerb.safeParse(value);
	if (!verb.success) {
		throw new Response("Not Found", { status: 404 });
	}
	return verb.data;
}

/** The URL's verb, or the default outside `/:verb/…`. */
export function useLoaderVerb(): LoaderVerb {
	const params = useParams();
	return LoaderVerb.safeParse(params.verb).data ?? DEFAULT_LOADER_VERB;
}

/**
 * Starts a query with the verb in the URL. `prefetch` returns the handle at
 * once; `ensure` and `fetch` resolve with a handle that has the data. Await
 * the loader's handles together (`allKeyed`) so the queries start together.
 *
 * The server runs every loader with a new client, so its cache is empty and
 * `ensure` waits as long as `fetch`.
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
