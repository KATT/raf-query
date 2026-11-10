import type {
	InfiniteQueryFactory,
	PageControls,
	QueryHandle,
} from "@raf-query/core";
import {
	type Entry,
	type EntryState,
	fetchPage,
	pageState,
} from "@raf-query/core/internal";

import {
	type QueryState,
	type QueryValue,
	useQueryRead,
	type UseQueryOptions,
} from "./use-query.ts";
import type { Fields } from "./tracked.ts";

/**
 * What `useInfiniteQuery` returns next to the data: core's paging controls
 * and the query's state.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#reading-pages
 */
export interface InfiniteQueryState<
	TFactory extends InfiniteQueryFactory = InfiniteQueryFactory,
>
	extends PageControls, QueryState<TFactory> {}

/** Core's paging controls, split into stable actions and tracked fields. */
function pageFields(entry: Entry, state: EntryState): Fields {
	return {
		actions: {
			fetchNextPage: () => fetchPage(entry, "next"),
			fetchPreviousPage: () => fetchPage(entry, "previous"),
		},
		fields: { ...pageState(entry, state) },
	};
}

/**
 * Read a paged query (`infiniteQueryOptions`) by its handle. The data is
 * `{ pages, pageParams }`, and its state loads more pages.
 *
 * ```tsx
 * const [pagesThenable, pagesState] = useInfiniteQuery(commentsQuery, handles.comments);
 * const pages = use(pagesThenable);
 * ```
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#reading-pages
 */
export function useInfiniteQuery<TFactory extends InfiniteQueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions,
): readonly [QueryValue<TFactory>, InfiniteQueryState<TFactory>] {
	const read = useQueryRead<InfiniteQueryState<TFactory>>(
		factory,
		handle,
		options,
		pageFields,
	);
	return [
		// SAFETY: `QueryValue` describes what was read for this handle.
		read.thenable as QueryValue<TFactory>,
		read.controls,
	];
}
