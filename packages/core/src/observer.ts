import type { QueryKey } from "./key.ts";
import type { QueryFactory } from "./options.ts";
import type { Query, SubscribeOptions } from "./query.ts";

/** How one reader observes its query. */
export interface QueryObserverOptions {
	/** Refetch on this interval (ms) while subscribed and the page is visible. */
	readonly refetchInterval?: number;
	/** Refetch on reconnect while stale. Default: the query's option, else `true`. */
	readonly refetchOnReconnect?: boolean;
	/** Refetch on window focus while stale. Default: the query's option, else `true`. */
	readonly refetchOnWindowFocus?: boolean;
	/**
	 * What to show while the query has no data yet:
	 * - `"suspend"` (default): the result's promise is the query's pending one.
	 * - `"previous"`: keep the last observed query's data, with `isPrevious`.
	 */
	readonly whilePending?: "previous" | "suspend";
}

/** What a reader sees of its query. Replaced, never mutated, on every change. */
export interface QueryObserverResult<TData = unknown> {
	/** Error of the last failed request. Existing data stays readable. */
	readonly error: unknown;
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	/** Stable string form of the observed query's key. */
	readonly hash: string;
	readonly hasNextPage: boolean;
	readonly hasPreviousPage: boolean;
	/** Input of the data in `promise`; differs from the query's while `isPrevious`. */
	readonly input: unknown;
	/** A request is in flight: first load, new input, or background refetch. */
	readonly isFetching: boolean;
	readonly isFetchingNextPage: boolean;
	readonly isFetchingPreviousPage: boolean;
	/** No data yet for the observed query. */
	readonly isPending: boolean;
	/** `promise` holds a previous query's data (`whilePending: "previous"`). */
	readonly isPrevious: boolean;
	/** The data is older than `staleTime`, or was invalidated. */
	readonly isStale: boolean;
	/** Key of the data in `promise`; differs from the query's while `isPrevious`. */
	readonly key: QueryKey;
	/** Settles with the data to show; see `QueryState.promise`. */
	readonly promise: Promise<TData>;
	refetch(): Promise<void>;
	/** When the data in `promise` was fetched (ms since epoch); `0` before that. */
	readonly updatedAt: number;
}

type ResultKey = keyof QueryObserverResult;

const resultKeys = {
	error: true,
	fetchNextPage: true,
	fetchPreviousPage: true,
	hash: true,
	hasNextPage: true,
	hasPreviousPage: true,
	input: true,
	isFetching: true,
	isFetchingNextPage: true,
	isFetchingPreviousPage: true,
	isPending: true,
	isPrevious: true,
	isStale: true,
	key: true,
	promise: true,
	refetch: true,
	updatedAt: true,
} satisfies Record<ResultKey, true>;

function isResultKey(name: PropertyKey): name is ResultKey {
	return typeof name === "string" && Object.hasOwn(resultKeys, name);
}

function shallowEqual(a: QueryObserverResult, b: QueryObserverResult) {
	for (const name of Object.keys(resultKeys)) {
		if (isResultKey(name) && a[name] !== b[name]) {
			return false;
		}
	}
	return true;
}

/**
 * One reader of one query at a time, like TanStack Query's `QueryObserver`:
 * it derives the reader's result from the query's state, keeps a previous
 * query's data for `whilePending: "previous"`, runs `refetchInterval`, and
 * notifies its listeners only when a result property they read changed
 * (see {@link QueryObserver.trackResult}). Bindings create one per hook.
 */
export class QueryObserver<
	TData = unknown,
	TFactory extends QueryFactory = QueryFactory,
> {
	#current: QueryObserverResult<TData>;
	#interval: ReturnType<typeof setInterval> | undefined;
	#lastWithData: Query<TData, TFactory> | undefined;
	#listeners = new Set<() => void>();
	#options: QueryObserverOptions;
	#query: Query<TData, TFactory>;
	#trackedProps = new Set<ResultKey>();
	#unsubscribe: (() => void) | undefined;

	constructor(
		query: Query<TData, TFactory>,
		options: QueryObserverOptions = {},
	) {
		this.#query = query;
		this.#options = options;
		this.#current = this.#createResult(query, options);
		this.updateResult();
	}

	/**
	 * The result for `query` with `options` right now, without switching to
	 * it. Bindings call this during render, before `setOptions` commits.
	 */
	getOptimisticResult(
		query: Query<TData, TFactory>,
		options: QueryObserverOptions,
	): QueryObserverResult<TData> {
		const result = this.#createResult(query, options);
		if (!shallowEqual(this.#current, result)) {
			this.#current = result;
		}
		return result;
	}

	getCurrentResult = (): QueryObserverResult<TData> => this.#current;

	/** Observe `query` with `options` from now on. */
	setOptions(query: Query<TData, TFactory>, options: QueryObserverOptions) {
		const previous = this.#query;
		const previousInterval = this.#options.refetchInterval;
		this.#query = query;
		this.#options = options;
		if (this.#listeners.size > 0) {
			if (query !== previous) {
				this.#unsubscribe?.();
				this.#unsubscribe = this.#subscribeToQuery();
			}
			if (query !== previous || options.refetchInterval !== previousInterval) {
				this.#startInterval();
			}
		}
		this.updateResult();
	}

	/** Listen for result changes. The first listener subscribes to the query. */
	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		if (this.#listeners.size === 1) {
			this.#unsubscribe = this.#subscribeToQuery();
			this.#startInterval();
			this.updateResult();
		}
		return () => {
			if (!this.#listeners.delete(listener) || this.#listeners.size > 0) {
				return;
			}
			this.#unsubscribe?.();
			this.#unsubscribe = undefined;
			clearInterval(this.#interval);
		};
	};

	/**
	 * Wrap `result` so that reading a property marks it tracked. Once any
	 * property is tracked, listeners are only notified when a tracked one
	 * changes.
	 */
	trackResult<TResult extends QueryObserverResult<TData>>(
		result: TResult,
	): TResult {
		return new Proxy(result, {
			get: (target, name, receiver) => {
				if (isResultKey(name)) {
					this.trackProp(name);
				}
				// oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy trap forwarding to its target
				return Reflect.get(target, name, receiver);
			},
		});
	}

	/** Mark `name` as read, for bindings that track access themselves. */
	trackProp(name: ResultKey) {
		this.#trackedProps.add(name);
	}

	/** Recompute the result, and notify listeners if a tracked property changed. */
	updateResult() {
		const previous = this.#current;
		const next = this.#createResult(this.#query, this.#options);
		if (this.#query.getState().hasData) {
			this.#lastWithData = this.#query;
		}
		if (shallowEqual(previous, next)) {
			return;
		}
		this.#current = next;
		if (this.#shouldNotify(previous, next)) {
			for (const listener of this.#listeners) {
				listener();
			}
		}
	}

	#shouldNotify(previous: QueryObserverResult, next: QueryObserverResult) {
		if (this.#trackedProps.size === 0) {
			return true;
		}
		for (const name of this.#trackedProps) {
			if (previous[name] !== next[name]) {
				return true;
			}
		}
		return false;
	}

	#subscribeToQuery() {
		const options = (): QueryObserverOptions => this.#options;
		const preferences: SubscribeOptions = {
			get refetchOnReconnect() {
				return options().refetchOnReconnect;
			},
			get refetchOnWindowFocus() {
				return options().refetchOnWindowFocus;
			},
		};
		return this.#query.subscribe(() => this.updateResult(), preferences);
	}

	#startInterval() {
		clearInterval(this.#interval);
		this.#interval = undefined;
		const interval = this.#options.refetchInterval;
		if (interval === undefined || !Number.isFinite(interval) || interval <= 0) {
			return;
		}
		this.#interval = setInterval(() => {
			if (
				!("document" in globalThis) ||
				document.visibilityState !== "hidden"
			) {
				void this.#query.refetch();
			}
		}, interval);
	}

	#createResult(
		query: Query<TData, TFactory>,
		options: QueryObserverOptions,
	): QueryObserverResult<TData> {
		const state = query.getState();
		const last = this.#lastWithData;
		const previous =
			options.whilePending === "previous" &&
			!state.hasData &&
			state.status !== "error" &&
			last !== undefined &&
			last.hash !== query.hash
				? last
				: undefined;
		const shown = previous ?? query;
		const shownState = previous ? previous.getState() : state;
		return {
			error: state.error,
			fetchNextPage: query.fetchNextPage,
			fetchPreviousPage: query.fetchPreviousPage,
			hash: query.hash,
			hasNextPage: query.hasNextPage(),
			hasPreviousPage: query.hasPreviousPage(),
			input: shown.handle.input,
			isFetching: state.isFetching,
			isFetchingNextPage: state.fetchDirection === "forward",
			isFetchingPreviousPage: state.fetchDirection === "backward",
			isPending: !state.hasData,
			isPrevious: previous !== undefined,
			isStale: state.isStale,
			key: shown.handle.key,
			promise: shownState.promise,
			refetch: query.refetch,
			updatedAt: shownState.updatedAt,
		};
	}
}
