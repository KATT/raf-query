import { type Entry, entryOf, type EntryState, fetchEntry } from "../entry.ts";
import type { InfiniteQueryFactory, InputArgs } from "../options.ts";
import type { ClientFor } from "../verbs.ts";
import { type InfiniteData, pageParamAfter } from "./infinite.ts";

/**
 * Which way a page loads: after the last one, or before the first.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#reading-pages
 */
export type PageDirection = "next" | "previous";

/**
 * Where a paged query can load more, and what it's loading now.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#reading-pages
 */
export interface PageState {
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
}

/**
 * A paged query's {@link PageState} and the requests that load more:
 * `useInfiniteQuery`'s paging controls.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#reading-pages
 */
export interface PageControls extends PageState {
	/** Load the page after the last one. Resolves when it's there. */
	fetchNextPage(): Promise<void>;
	/** Load the page before the first one. Resolves when it's there. */
	fetchPreviousPage(): Promise<void>;
}

function hasPage(
	entry: Entry,
	state: EntryState,
	direction: PageDirection,
): boolean {
	return (
		state.hasData &&
		pageParamAfter(
			// SAFETY: paged entries come from `infiniteQueryOptions`, whose options have the page param functions.
			entry.options as never,
			// SAFETY: and the data they fetch is `InfiniteData`.
			state.data as InfiniteData<unknown>,
			direction,
		) !== undefined
	);
}

/** A paged entry's {@link PageState}, from `state` (the entry's own by default). */
export function pageState(
	entry: Entry,
	state: EntryState = entry.state,
): PageState {
	return {
		hasNextPage: hasPage(entry, state, "next"),
		hasPreviousPage: hasPage(entry, state, "previous"),
		isFetchingNextPage: state.fetchingDirection === "next",
		isFetchingPreviousPage: state.fetchingDirection === "previous",
	};
}

/**
 * Load a paged entry's page in `direction`; resolves when the request
 * settles, and does nothing without a page at that end. An error stays in
 * the entry's state.
 */
export function fetchPage(
	entry: Entry,
	direction: PageDirection,
): Promise<void> {
	return fetchEntry(entry, { direction }).then(() => {});
}

/**
 * Load the page after the last one of a paged query, as `useInfiniteQuery`'s
 * `fetchNextPage()` does. Resolves when the page is there, or the request
 * settles; does nothing without a next page.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#outside-react
 */
export function fetchNextPage<TFactory extends InfiniteQueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	return fetchPage(entryOf(client, factory, input[0]), "next");
}

/**
 * Load the page before the first one of a paged query, as
 * `useInfiniteQuery`'s `fetchPreviousPage()` does. See {@link fetchNextPage}.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#outside-react
 */
export function fetchPreviousPage<TFactory extends InfiniteQueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	return fetchPage(entryOf(client, factory, input[0]), "previous");
}

/**
 * Whether a paged query has a page after its last one: `false` while it has
 * no data, or once `getNextPageParam` returns `undefined`.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#outside-react
 */
export function hasNextPage<TFactory extends InfiniteQueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): boolean {
	return pageState(entryOf(client, factory, input[0])).hasNextPage;
}

/**
 * Whether a paged query has a page before its first one. See
 * {@link hasNextPage}.
 *
 * @see https://raf-query.katt.dev/docs/infinite-queries#outside-react
 */
export function hasPreviousPage<TFactory extends InfiniteQueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): boolean {
	return pageState(entryOf(client, factory, input[0])).hasPreviousPage;
}
