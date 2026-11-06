import {
	type DataOf,
	type ErrorOf,
	failOf,
	type InputOf,
	QueryDisabledError,
	type QueryFactory,
	type QueryHandle,
	type Result,
	type Thenable,
} from "@raf-query/core";
import {
	type Entry,
	entryOf,
	fetchEntry,
	fulfilled,
	isEnabled,
	isInvalidated,
	isStale,
	isWaterfallHandle,
	mapThenable,
	pageParamAfter,
	pending,
	rejected,
	subscribeEntry,
} from "@raf-query/core/internal";
import { use, useCallback, useState, useSyncExternalStore } from "react";

import { assertStartsRequests } from "./browser-only.ts";
import { useQueryClient } from "./provider.tsx";

export interface UseQueryOptions<TResult extends boolean = boolean> {
	/**
	 * Read the query's expected errors (`fail()`) as a `Result` instead of
	 * throwing them to an error boundary. Defects still throw.
	 */
	readonly result?: TResult;
	/**
	 * While a new handle's query has no data: `"suspend"` (the default) shows
	 * the Suspense fallback; `"previous"` keeps showing the last handle's data
	 * and sets `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

/** What `useQuery` returns next to the data. */
export interface QueryControls<TFactory extends QueryFactory = QueryFactory> {
	/** The last request's error while it's the latest outcome: a `fail()` value or a defect. */
	readonly error: unknown;
	readonly hash: string;
	readonly input: InputOf<TFactory>;
	readonly isFetching: boolean;
	/** No data yet. */
	readonly isPending: boolean;
	/** Showing the previous handle's data (`whilePending: "previous"`). */
	readonly isPrevious: boolean;
	readonly isStale: boolean;
	readonly queryKey: ReturnType<TFactory>["queryKey"];
	/** Fetch again, or join the request in flight. Resolves when it settles. */
	refetch(): Promise<void>;
	/** When the data was fetched (ms since epoch); `0` without data. */
	readonly updatedAt: number;
}

/** Extra controls for paged queries (`infiniteQueryOptions`). */
export interface PageControls {
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
}

type ControlsOf<TFactory extends QueryFactory> = QueryControls<TFactory> &
	(ReturnType<TFactory> extends { readonly getNextPageParam: unknown }
		? PageControls
		: unknown);

type Read<
	TFactory extends QueryFactory,
	TResult extends boolean,
> = TResult extends true
	? Result<DataOf<TFactory>, ErrorOf<TFactory>>
	: DataOf<TFactory>;

/**
 * What `useQuery` reads: the data itself for a defined handle (from a fetch
 * or ensure entry), and a thenable to pass to `use()` otherwise.
 */
export type QueryValue<
	TFactory extends QueryFactory,
	THandle,
	TResult extends boolean,
> = THandle extends { readonly defined: true }
	? Read<TFactory, TResult>
	: Thenable<Read<TFactory, TResult>>;

type Thenables = WeakMap<Thenable<unknown>, Thenable<unknown>>;

function toResult(reason: unknown): Thenable<unknown> {
	const failed = failOf(reason);
	return failed ? fulfilled({ error: failed, ok: false }) : rejected(reason);
}

function asResult(
	cache: Thenables,
	thenable: Thenable<unknown>,
): Thenable<unknown> {
	const cached = cache.get(thenable);
	if (cached) {
		return cached;
	}
	let mapped: Thenable<unknown>;
	if (thenable.status === "fulfilled") {
		mapped = fulfilled({ ok: true, value: thenable.value });
	} else if (thenable.status === "rejected") {
		mapped = toResult(thenable.reason);
	} else {
		const next = pending<unknown>();
		thenable.then(
			(value) => next.resolve({ ok: true, value }),
			(error: unknown) => {
				toResult(error).then(next.resolve, next.reject);
			},
		);
		mapped = next.promise;
	}
	cache.set(thenable, mapped);
	return mapped;
}

/**
 * Start the request of an entry nothing is loading: the reader of a
 * waterfall handle, or of a query the cache dropped. On a React Server
 * Components SSR client, that request belongs to the browser instead.
 */
function startIfMissing(entry: Entry, waterfall: boolean) {
	const state = entry.state;
	if (state.hasData || entry.run || state.status === "error") {
		return;
	}
	const client = entry.client;
	if (!isEnabled(entry)) {
		if (client.isServer) {
			throw new QueryDisabledError(`Query ${entry.hash} is disabled`);
		}
		return;
	}
	assertStartsRequests(client, entry.hash);
	if (process.env.NODE_ENV !== "production" && !waterfall && !client.isServer) {
		// oxlint-disable-next-line no-console -- a development-only hint
		console.warn(
			`raf-query: ${entry.hash} was read before anything loaded it, so it fetches while rendering. Start it in a loader with load(), or build the handle with waterfallHandle() to make the waterfall explicit.`,
		);
	}
	void fetchEntry(entry);
}

function pagesAround(entry: Entry) {
	const options = entry.options;
	const paged =
		options !== undefined &&
		"getNextPageParam" in options &&
		entry.state.hasData;
	const has = (direction: "next" | "previous") =>
		paged &&
		pageParamAfter(
			// SAFETY: options with `getNextPageParam` come from `infiniteQueryOptions`.
			options as never,
			// SAFETY: and so does the data they fetched.
			entry.state.data as never,
			direction,
		) !== undefined;
	return { hasNextPage: has("next"), hasPreviousPage: has("previous") };
}

function settled(promise: Promise<unknown>): Promise<void> {
	return promise.then(() => {});
}

/**
 * Read a query by its handle.
 *
 * ```tsx
 * const [issue] = useQuery(issueQuery, handles.issue); // defined: the data
 * const [comments] = useQuery(commentsQuery, handles.comments); // plain: use() it
 * const page = use(comments);
 * ```
 *
 * Reading never refetches stale data: loaders decide freshness. A query no
 * loader started fetches while rendering, which is a waterfall (see
 * `waterfallHandle`).
 */
export function useQuery<
	TFactory extends QueryFactory,
	const THandle extends QueryHandle<TFactory>,
	const TResult extends boolean = false,
>(
	factory: TFactory,
	handle: THandle,
	options?: UseQueryOptions<TResult>,
): readonly [QueryValue<TFactory, THandle, TResult>, ControlsOf<TFactory>] {
	const client = useQueryClient();
	const current = entryOf(client, factory, handle.input);
	const subscribe = useCallback(
		(onChange: () => void) => {
			const unsubscribe = subscribeEntry(current, onChange);
			if (isInvalidated(current) && isEnabled(current)) {
				void fetchEntry(current);
			}
			return unsubscribe;
		},
		[current],
	);
	const getState = () => current.state;
	const state = useSyncExternalStore(subscribe, getState, getState);
	const [shown, setShown] = useState(current);
	if (shown !== current && state.hasData) {
		setShown(current);
	}
	const isPrevious =
		options?.whilePending === "previous" &&
		!state.hasData &&
		shown !== current &&
		shown.state.hasData;
	const entry = isPrevious ? shown : current;
	startIfMissing(current, isWaterfallHandle(handle));
	const caches = useState(() => ({
		result: new WeakMap(),
		select: new WeakMap(),
	}))[0];
	const select = entry.options?.select;
	let thenable: Thenable<unknown> = select
		? mapThenable(caches.select, entry.thenable, select)
		: entry.thenable;
	if (options?.result) {
		thenable = asResult(caches.result, thenable);
	}
	const value =
		"defined" in handle && handle.defined ? use(thenable) : thenable;
	const controls = {
		...pagesAround(entry),
		error: state.error,
		fetchNextPage: () => settled(fetchEntry(entry, { direction: "next" })),
		fetchPreviousPage: () =>
			settled(fetchEntry(entry, { direction: "previous" })),
		hash: current.hash,
		input: handle.input,
		isFetching: state.isFetching,
		isFetchingNextPage: entry.state.fetchingDirection === "next",
		isFetchingPreviousPage: entry.state.fetchingDirection === "previous",
		isPending: !state.hasData,
		isPrevious,
		isStale: isStale(current),
		queryKey: handle.queryKey,
		refetch: () => settled(fetchEntry(current)),
		updatedAt: state.updatedAt,
	};
	return [
		// SAFETY: `QueryValue` describes what was read for this handle.
		value as QueryValue<TFactory, THandle, TResult>,
		// SAFETY: paged controls are only typed for paged factories.
		controls as ControlsOf<TFactory>,
	];
}
