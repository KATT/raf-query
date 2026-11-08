import {
	type DataOf,
	type ErrorOf,
	failOf,
	type InputOf,
	type QueryFactory,
	type QueryHandle,
	type Result,
	type SingleQueryFactory,
	type Thenable,
} from "@raf-query/core";
import {
	type Entry,
	entryOf,
	type EntryState,
	fetchEntry,
	fulfilled,
	isEnabled,
	isInvalidated,
	isStale,
	isWaterfallHandle,
	mapThenable,
	pending,
	rejected,
	subscribeEntry,
} from "@raf-query/core/internal";
import { useCallback, useState, useSyncExternalStore } from "react";

import { browserRender, leavesUnstartedToBrowser } from "./browser-render.ts";
import {
	createTracker,
	type Fields,
	type Read as TrackedRead,
	renderedChanged,
	trackedState,
} from "./tracked.ts";
import { useQueryClient } from "./provider.tsx";

/** Bundlers replace `process.env.NODE_ENV`; typed here so consumers need no Node types. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

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
export interface QueryState<TFactory extends QueryFactory = QueryFactory> {
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

type Read<
	TFactory extends QueryFactory,
	TResult extends boolean,
> = TResult extends true
	? Result<DataOf<TFactory>, ErrorOf<TFactory>>
	: DataOf<TFactory>;

/**
 * What `useQuery` and `useInfiniteQuery` read, for every handle: a thenable
 * to pass to `use()`.
 * A loader can't promise the data is still cached when a component renders
 * (a write can reset or remove it), so the read may suspend.
 */
export type QueryValue<
	TFactory extends QueryFactory,
	TResult extends boolean = false,
> = Thenable<Read<TFactory, TResult>>;

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

/** Whether nothing is loading the entry: no data, no error, no request in flight. */
function isIdle(entry: Entry, state: EntryState): boolean {
	return !state.hasData && !entry.run && state.status !== "error";
}

/**
 * Start the request of an entry nothing is loading: the reader of a
 * waterfall handle, or of a query the cache dropped. A server render fed by
 * server components leaves it to the browser: nothing would send its data.
 */
function startIfMissing(entry: Entry, state: EntryState, waterfall: boolean) {
	const client = entry.client;
	if (
		!isIdle(entry, state) ||
		!isEnabled(entry) ||
		leavesUnstartedToBrowser(client)
	) {
		return;
	}
	if (process.env.NODE_ENV !== "production" && !waterfall && !client.isServer) {
		// oxlint-disable-next-line no-console -- a development-only hint
		console.warn(
			`raf-query: ${entry.hash} was read before anything loaded it, so it fetches while rendering. Start it in a loader with load(), or build the handle with waterfallHandle() to make the waterfall explicit.`,
		);
	}
	void fetchEntry(entry);
}

/**
 * On the server, an entry still idle after `startIfMissing` (disabled, or
 * left to the browser) reads as a rejection: a `use()` of it inside Suspense
 * renders that boundary's fallback, and the browser renders the content.
 */
function readOf(entry: Entry, state: EntryState): Thenable<unknown> {
	return entry.client.isServer && isIdle(entry, state)
		? browserRender(entry)
		: entry.thenable;
}

export function settled(promise: Promise<unknown>): Promise<void> {
	return promise.then(() => {});
}

/** The state a kind of query adds, from the entry it shows and that entry's state. */
export type ExtraFields = (entry: Entry, state: EntryState) => Fields;

/**
 * One read of the entry. It takes both entries' states as arguments: core
 * writes a new state object with every write (and the thenable that
 * carries it), so a compiler that memoizes the call recomputes it.
 */
function readQuery(
	current: Entry,
	state: EntryState,
	shown: Entry,
	shownState: EntryState,
	handle: QueryHandle,
	options: UseQueryOptions | undefined,
	extra: ExtraFields | undefined,
): TrackedRead & { readonly entry: Entry } {
	const isPrevious =
		options?.whilePending === "previous" &&
		!state.hasData &&
		shown !== current &&
		shownState.hasData;
	const entry = isPrevious ? shown : current;
	const entryState = isPrevious ? shownState : state;
	const added = extra?.(entry, entryState);
	return {
		actions: {
			refetch: () => settled(fetchEntry(current)),
			...added?.actions,
		},
		entry,
		fields: {
			error: state.error,
			hash: current.hash,
			input: handle.input,
			isFetching: state.isFetching,
			isPending: !state.hasData,
			isPrevious,
			isStale: isStale(current),
			queryKey: handle.queryKey,
			updatedAt: state.updatedAt,
			...added?.fields,
		},
		source: readOf(entry, entryState),
	};
}

/** What both hooks read: the thenable, and the tracked state. */
export interface QueryRead<TControls> {
	readonly controls: TControls;
	readonly thenable: Thenable<unknown>;
}

/**
 * The read both hooks share: the thenable, and the state with the fields
 * `extra` adds. The state is tracked: the component re-renders, and gets a
 * new state object, only when the thenable or a field it read changes.
 */
export function useQueryRead<TControls extends object>(
	factory: QueryFactory,
	handle: QueryHandle,
	options: UseQueryOptions | undefined,
	extra?: ExtraFields,
): QueryRead<TControls> {
	const client = useQueryClient();
	const current = entryOf(client, factory, handle.input);
	const [tracker] = useState(createTracker);
	const subscribe = useCallback(
		(onChange: () => void) => {
			const unsubscribe = subscribeEntry(current, () => {
				if (renderedChanged(tracker)) {
					onChange();
				}
			});
			if (isInvalidated(current) && isEnabled(current)) {
				void fetchEntry(current);
			}
			return unsubscribe;
		},
		[current, tracker],
	);
	const getState = () => current.state;
	const state = useSyncExternalStore(subscribe, getState, getState);
	const [shown, setShown] = useState(current);
	if (shown !== current && state.hasData) {
		setShown(current);
	}
	startIfMissing(current, state, isWaterfallHandle(handle));
	const read = readQuery(
		current,
		state,
		shown,
		shown.state,
		handle,
		options,
		extra,
	);
	const controls = trackedState(tracker, read, () =>
		readQuery(
			current,
			current.state,
			shown,
			shown.state,
			handle,
			options,
			extra,
		),
	);
	const caches = useState(() => ({
		result: new WeakMap(),
		select: new WeakMap(),
	}))[0];
	const select = read.entry.options?.select;
	let thenable: Thenable<unknown> = select
		? mapThenable(caches.select, read.source, select)
		: read.source;
	if (options?.result) {
		thenable = asResult(caches.result, thenable);
	}
	// SAFETY: `extra` adds the fields the caller's controls type declares to `readQuery`'s.
	const typed = controls as TControls;
	return { controls: typed, thenable };
}

/**
 * Read a query by its handle.
 *
 * ```tsx
 * const [issueThenable, issueState] = useQuery(issueQuery, handles.issue);
 * const issue = use(issueThenable);
 * ```
 *
 * Reading never refetches stale data: loaders decide freshness. A query no
 * loader started fetches while rendering, which is a waterfall (see
 * `waterfallHandle`). Paged queries read with `useInfiniteQuery`.
 */
export function useQuery<
	TFactory extends SingleQueryFactory,
	const TResult extends boolean = false,
>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	options?: UseQueryOptions<TResult>,
): readonly [QueryValue<TFactory, TResult>, QueryState<TFactory>] {
	const read = useQueryRead<QueryState<TFactory>>(factory, handle, options);
	return [
		// SAFETY: `QueryValue` describes what was read for this handle.
		read.thenable as QueryValue<TFactory, TResult>,
		read.controls,
	];
}
