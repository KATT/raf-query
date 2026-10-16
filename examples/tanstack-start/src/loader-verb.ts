import type { LoaderVerb } from "@examples/db/types";
import {
	type DataOf,
	type InputArgs,
	type QueryClient,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	useQuery,
	type UseQueryControls,
	type UseQueryOptions,
} from "@raf-query/react";
import { use } from "react";

/**
 * Starts a query with the verb in the URL. `prefetch` returns the handle at
 * once; `ensure` and `fetch` resolve with a handle that has the data. Await
 * the loader's handles together (`allKeyed`) so the queries start together.
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

/**
 * `useQuery` for a handle from any verb, unwrapped to its data. A `prefetch`
 * handle's promise suspends until the data lands; an `ensure` or `fetch`
 * handle carries its data, so `useQuery` returns it as is.
 */
export function useQueryData<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions,
): readonly [DataOf<TFactory>, UseQueryControls<TFactory>] {
	// SAFETY: these factories' `queryFn`s return promises, so `useQuery`
	// throws on failure: its first slot is the data for a handle with data
	// (it checks `"data" in handle`), and a promise of the data otherwise.
	const [value, controls] = useQuery(factory, handle, options) as unknown as [
		DataOf<TFactory> | Promise<DataOf<TFactory>>,
		UseQueryControls<TFactory>,
	];
	if ("data" in handle) {
		// SAFETY: see above; a handle with data gets its data.
		return [value as DataOf<TFactory>, controls];
	}
	// SAFETY: see above; a handle without data gets a promise.
	return [use(value as Promise<DataOf<TFactory>>), controls];
}
