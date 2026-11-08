import type { InfiniteQueryFactory, QueryHandle } from "@raf-query/core";
import {
	type Entry,
	fetchEntry,
	pageParamAfter,
} from "@raf-query/core/internal";

import {
	type QueryControls,
	type QueryValue,
	settled,
	type State,
	useQueryRead,
	type UseQueryOptions,
} from "./use-query.ts";

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
export interface InfiniteQueryControls<
	TFactory extends InfiniteQueryFactory = InfiniteQueryFactory,
>
	extends PageControls, QueryControls<TFactory> {}

function hasPage(
	entry: Entry,
	state: State,
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

/**
 * Read a paged query (`infiniteQueryOptions`) by its handle. The data is
 * `{ pages, pageParams }`, and the controls load more pages.
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
): readonly [QueryValue<TFactory, TResult>, InfiniteQueryControls<TFactory>] {
	const read = useQueryRead(factory, handle, options);
	const entry = read.entry;
	// Like the read, paging takes the entry's state as an argument so a
	// compiler that memoizes it recomputes on every write.
	const entryState = read.entryState;
	return [
		// SAFETY: `QueryValue` describes what was read for this handle.
		read.thenable as QueryValue<TFactory, TResult>,
		{
			...read.controls,
			fetchNextPage: () => settled(fetchEntry(entry, { direction: "next" })),
			fetchPreviousPage: () =>
				settled(fetchEntry(entry, { direction: "previous" })),
			hasNextPage: hasPage(entry, entryState, "next"),
			hasPreviousPage: hasPage(entry, entryState, "previous"),
			isFetchingNextPage: entryState.fetchingDirection === "next",
			isFetchingPreviousPage: entryState.fetchingDirection === "previous",
		},
	];
}
