import {
	type DataOf,
	type QueryFactory,
	type QueryHandle,
	useQuery,
	type UseQueryControls,
	type UseQueryOptions,
} from "@raf-query/react";
import { use } from "react";

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
		return [
			// SAFETY: see above; a handle with data gets its data.
			value as DataOf<TFactory>,
			controls,
		];
	}
	return [
		use(
			// SAFETY: see above; a handle without data gets a promise.
			value as Promise<DataOf<TFactory>>,
		),
		controls,
	];
}
