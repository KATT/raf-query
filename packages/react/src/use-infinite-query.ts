import type { InfiniteQueryFactory, QueryHandle } from "@raf-query/core";
import {
	type Entry,
	type EntryState,
	fetchEntry,
	pageParamAfter,
} from "@raf-query/core/internal";

import {
	type QueryState,
	type QueryValue,
	settled,
	useQueryRead,
	type UseQueryOptions,
} from "./use-query.ts";
import type { Fields } from "./tracked.ts";

/** The paging half of what `useInfiniteQuery` returns. */
export interface PageControls {
	/** Load the page after the last one. Resolves when it's there. */
	fetchNextPage(): Promise<void>;
	/** Load the page before the first one. Resolves when it's there. */
	fetchPreviousPage(): Promise<void>;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
}

/** What `useInfiniteQuery` returns next to the data. */
export interface InfiniteQueryState<
	TFactory extends InfiniteQueryFactory = InfiniteQueryFactory,
>
	extends PageControls, QueryState<TFactory> {}

function hasPage(
	entry: Entry,
	state: EntryState,
	direction: "next" | "previous",
): boolean {
	return (
		state.hasData &&
		pageParamAfter(
			// SAFETY: `useInfiniteQuery` reads factories from `infiniteQueryOptions`, and `entryOf` set their options.
			entry.options as never,
			// SAFETY: and the data they fetch is `InfiniteData`.
			state.data as never,
			direction,
		) !== undefined
	);
}

function pageFields(entry: Entry, state: EntryState): Fields {
	return {
		actions: {
			fetchNextPage: () => settled(fetchEntry(entry, { direction: "next" })),
			fetchPreviousPage: () =>
				settled(fetchEntry(entry, { direction: "previous" })),
		},
		fields: {
			hasNextPage: hasPage(entry, state, "next"),
			hasPreviousPage: hasPage(entry, state, "previous"),
			isFetchingNextPage: state.fetchingDirection === "next",
			isFetchingPreviousPage: state.fetchingDirection === "previous",
		},
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
 */
export function useInfiniteQuery<
	TFactory extends InfiniteQueryFactory,
	const TResult extends boolean = false,
>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions<TResult>,
): readonly [QueryValue<TFactory, TResult>, InfiniteQueryState<TFactory>] {
	const read = useQueryRead<InfiniteQueryState<TFactory>>(
		factory,
		handle,
		options,
		pageFields,
	);
	return [
		// SAFETY: `QueryValue` describes what was read for this handle.
		read.thenable as QueryValue<TFactory, TResult>,
		read.controls,
	];
}
