import type { LoaderVerb } from "@examples/db/types";
import {
	type InputArgs,
	type QueryClient,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	useQuery,
	type UseQueryOptions,
	type UseQueryResultWithData,
	type UseQueryThrowOptions,
} from "@raf-query/react";
import { use } from "react";

/**
 * Starts a query with the verb in the URL. `prefetch` returns the handle at
 * once; `ensure` and `fetch` resolve with a handle that has the data, and
 * reject with the query's failure. Await the loader's handles together
 * (`allKeyed`) so the queries start together.
 */
export function startQuery<TServices, TFactory extends QueryFactory<TServices>>(
	queryClient: QueryClient<TServices>,
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
 * `useQuery` for a handle from any verb, unwrapped: the data with
 * `throwOnError: true`, else a `Result`. A `prefetch` handle's promise
 * suspends until the data lands; an `ensure` or `fetch` handle carries its
 * data, so `useQuery` unwraps it itself.
 */
export function useQueryData<
	TFactory extends QueryFactory,
	const TThrow extends boolean | undefined = undefined,
>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions &
		UseQueryThrowOptions<TFactory> & { readonly throwOnError?: TThrow },
): UseQueryResultWithData<TFactory, TThrow> {
	const [value, controls] = useQuery(factory, handle, options);
	if ("data" in handle) {
		// SAFETY: `useQuery` checks `"data" in handle` the same way and, for a
		// handle with data, returns the unwrapped value its types give a
		// `QueryHandleWithData`.
		return [value, controls] as unknown as UseQueryResultWithData<
			TFactory,
			TThrow
		>;
	}
	const unwrapped = use(
		// SAFETY: for a handle without data the first slot is a promise of
		// the value `useQuery` returns for a handle with data.
		value as Promise<unknown>,
	);
	// SAFETY: see above; `use` unwrapped that promise.
	return [unwrapped, controls] as unknown as UseQueryResultWithData<
		TFactory,
		TThrow
	>;
}
