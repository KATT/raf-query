import { Cause, Effect, Exit, Predicate, Schedule } from "effect";

import type { QueryKey } from "./key.ts";
import { scheduleNotify } from "./notify.ts";
import type {
	AnyQueryOptions,
	InfiniteData,
	InfiniteQueryOptions,
	QueryBehavior,
	QueryFactory,
	QueryFnResult,
	QueryHandle,
	RetryPolicy,
} from "./options.ts";
import { fulfilled, type Pending, pending, type Thenable } from "./thenable.ts";

/** A snapshot of one cache entry. Replaced, never mutated, on every change. */
export interface QueryState<TData> {
	/** Last successful data, kept through background errors. */
	readonly data: TData | undefined;
	/** Error of the last failed request, or `null`. */
	readonly error: unknown;
	/** Failed attempts of the current request, retries included. */
	readonly failureCount: number;
	/** Set while a paged query loads a page at one end of the list. */
	readonly fetchDirection: "backward" | "forward" | undefined;
	readonly hasData: boolean;
	/** A request is in flight. */
	readonly isFetching: boolean;
	/** Marked stale by `invalidate`; cleared by the next successful request. */
	readonly isInvalidated: boolean;
	/** Older than `staleTime`, invalidated, or without data. */
	readonly isStale: boolean;
	/**
	 * Settles with `data`. A new promise is created per data version, already
	 * fulfilled once data exists, so it can be read synchronously.
	 */
	readonly promise: Thenable<TData>;
	readonly status: "error" | "pending" | "success";
	/** When `data` was fetched (ms since epoch); `0` without data. */
	readonly updatedAt: number;
}

/** Per-reader preferences, registered with {@link Query.subscribe}. */
export interface QueryObserver {
	readonly refetchOnReconnect?: boolean;
	readonly refetchOnWindowFocus?: boolean;
}

export interface FetchRequest {
	/** Load one more page at this end of a paged query. */
	readonly direction?: "backward" | "forward";
	/** Pages to load when a paged query has none yet. */
	readonly pages?: number;
	/** Abort an in-flight request and start over (used by `invalidate`). */
	readonly restart?: boolean;
}

/**
 * A cache entry, as seen by bindings. Obtain one with
 * `QueryClient.getQuery(factory, input)`.
 */
export interface Query<
	TData = unknown,
	TFactory extends QueryFactory = QueryFactory,
> {
	/** Start a request, or join the one in flight. */
	fetch(request?: FetchRequest): Promise<TData>;
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	getState(): QueryState<TData>;
	/** The serializable handle for this entry's factory call. */
	readonly handle: QueryHandle<TFactory>;
	/** Stable string form of `key`. */
	readonly hash: string;
	hasNextPage(): boolean;
	hasPreviousPage(): boolean;
	invalidate(): Promise<void>;
	/** Staleness as of now; `getState().isStale` is only kept current while read. */
	isStaleNow(): boolean;
	readonly key: QueryKey;
	/** Readers currently subscribed. */
	readonly observerCount: number;
	/** Options from the latest factory call; `undefined` for an entry only hydrated so far. */
	readonly options: AnyQueryOptions | undefined;
	/**
	 * The promise a render should unwrap. Starts the first request if nothing
	 * has, and retries a failed first load once its error has been shown.
	 */
	read(): Promise<TData>;
	/** Refetch now; resolves when the request settles. */
	refetch(): Promise<void>;
	/**
	 * Drop data and errors, back to the state of a new entry. Readers suspend
	 * and refetch; resolves when that refetch settles.
	 */
	reset(): Promise<void>;
	/** Listen for state changes. Subscribed entries count as read. */
	subscribe(listener: () => void, observer?: QueryObserver): () => void;
}

/** Thrown into a request's awaiters when the cache is cleared mid-request. */
export class CancelledError extends Error {
	constructor() {
		super("The query was cancelled");
		this.name = "CancelledError";
	}
}

/** What an entry needs from its client. */
export interface QueryHost {
	changed(query: QueryEntry): void;
	readonly defaults: QueryBehavior;
	readonly isServer: boolean;
	/** A reader subscribed or unsubscribed. */
	observersChanged(query: QueryEntry): void;
	remove(query: QueryEntry): void;
	reportError(error: unknown, query: QueryEntry): void;
}

interface InFlight {
	readonly controller: AbortController;
	readonly deferred: Pending<unknown>;
}

const noop = () => {};
const identity = <T>(value: T) => value;
const defaultObserver: QueryObserver = {};

function isEffectResult<T>(
	result: QueryFnResult<T>,
): result is Effect.Effect<T, unknown> {
	return Effect.isEffect(result);
}

export function isInfiniteData(
	data: unknown,
): data is InfiniteData<unknown, unknown> {
	return (
		Predicate.hasProperty(data, "pages") &&
		Predicate.hasProperty(data, "pageParams") &&
		Array.isArray(data.pages) &&
		Array.isArray(data.pageParams)
	);
}

function shouldRetry(
	retry: Exclude<RetryPolicy, Schedule.Schedule<unknown, unknown>>,
	failureCount: number,
	error: unknown,
) {
	if (Predicate.isBoolean(retry)) {
		return retry;
	}
	if (Predicate.isNumber(retry)) {
		return failureCount <= retry;
	}
	return retry(failureCount, error);
}

export function nextPageParam(
	options: InfiniteQueryOptions<unknown, unknown>,
	data: InfiniteData<unknown, unknown>,
) {
	if (data.pages.length === 0) {
		return undefined;
	}
	return options.getNextPageParam(
		data.pages.at(-1),
		data.pages,
		data.pageParams.at(-1),
		data.pageParams,
	);
}

export function previousPageParam(
	options: InfiniteQueryOptions<unknown, unknown>,
	data: InfiniteData<unknown, unknown>,
) {
	if (data.pages.length === 0 || !options.getPreviousPageParam) {
		return undefined;
	}
	return options.getPreviousPageParam(
		data.pages[0],
		data.pages,
		data.pageParams[0],
		data.pageParams,
	);
}

function addPage(
	data: InfiniteData<unknown, unknown>,
	page: unknown,
	pageParam: unknown,
	direction: "backward" | "forward",
	maxPages: number | undefined,
): InfiniteData<unknown, unknown> {
	const forward = direction === "forward";
	const pages = forward ? [...data.pages, page] : [page, ...data.pages];
	const pageParams = forward
		? [...data.pageParams, pageParam]
		: [pageParam, ...data.pageParams];
	if (maxPages === undefined || pages.length <= maxPages) {
		return { pageParams, pages };
	}
	return forward
		? { pageParams: pageParams.slice(-maxPages), pages: pages.slice(-maxPages) }
		: {
				pageParams: pageParams.slice(0, maxPages),
				pages: pages.slice(0, maxPages),
			};
}

export class QueryEntry implements Query {
	readonly hash: string;
	readonly key: QueryKey;
	#errorShown = false;
	#errorShownTimer: ReturnType<typeof setTimeout> | undefined;
	#gcTimer: ReturnType<typeof setTimeout> | undefined;
	#handle: QueryHandle;
	#host: QueryHost;
	#inFlight: InFlight | undefined;
	#listeners = new Map<() => void, QueryObserver>();
	#options: AnyQueryOptions | undefined;
	#pending: Pending<unknown> | undefined;
	#staleTimer: ReturnType<typeof setTimeout> | undefined;
	#state: QueryState<unknown>;

	constructor(host: QueryHost, key: QueryKey, hash: string) {
		this.#host = host;
		this.key = key;
		this.hash = hash;
		this.#handle = { input: undefined, key };
		this.#pending = pending();
		this.#state = {
			data: undefined,
			error: null,
			failureCount: 0,
			fetchDirection: undefined,
			hasData: false,
			isFetching: false,
			isInvalidated: false,
			isStale: true,
			promise: this.#pending.promise,
			status: "pending",
			updatedAt: 0,
		};
		this.#scheduleGc();
	}

	get handle() {
		return this.#handle;
	}

	get options() {
		return this.#options;
	}

	/** Readers are subscribed; `invalidate` and focus refetch only what is read. */
	get isObserved() {
		return this.#listeners.size > 0;
	}

	get observerCount() {
		return this.#listeners.size;
	}

	getState = () => this.#state;

	isStaleNow = () => this.#computeStale(this.#state);

	subscribe = (listener: () => void, observer = defaultObserver) => {
		this.#listeners.set(listener, observer);
		this.#clearGc();
		this.#scheduleStale();
		this.#host.observersChanged(this);
		return () => {
			if (!this.#listeners.delete(listener)) {
				return;
			}
			if (this.#listeners.size === 0) {
				clearTimeout(this.#staleTimer);
				this.#scheduleGc();
			}
			this.#host.observersChanged(this);
		};
	};

	/** Attach the options and input of the latest factory call. */
	setOptions(options: AnyQueryOptions, input: unknown) {
		this.#options = options;
		if (this.#handle.input !== input) {
			this.#handle = { input, key: this.key };
		}
	}

	read = () => {
		const state = this.#state;
		if (!state.hasData && !state.isFetching) {
			if (state.status !== "error" || this.#errorShown) {
				this.fetch().catch(noop);
			} else {
				this.#markErrorShown();
			}
		}
		return this.#state.promise;
	};

	fetch = (request: FetchRequest = {}): Promise<unknown> => {
		const options = this.#options;
		const inFlight = this.#inFlight;
		if (inFlight && !(request.restart && options)) {
			if (request.direction) {
				const next = () => this.fetch(request);
				return inFlight.deferred.promise.then(next, next);
			}
			return inFlight.deferred.promise;
		}
		if (!options) {
			return this.#state.promise;
		}
		inFlight?.controller.abort();
		return this.#start(this.#request(options, request), request.direction);
	};

	refetch = () => this.fetch().then(noop, noop);

	fetchNextPage = () => this.fetch({ direction: "forward" }).then(noop, noop);

	fetchPreviousPage = () =>
		this.fetch({ direction: "backward" }).then(noop, noop);

	hasNextPage = () => {
		const options = this.#options;
		const data = this.#state.data;
		return (
			options?.kind === "infinite" &&
			isInfiniteData(data) &&
			nextPageParam(options, data) != null
		);
	};

	hasPreviousPage = () => {
		const options = this.#options;
		const data = this.#state.data;
		return (
			options?.kind === "infinite" &&
			isInfiniteData(data) &&
			previousPageParam(options, data) != null
		);
	};

	invalidate = () => {
		this.#set({ isInvalidated: true });
		if (!this.isObserved || !this.#options) {
			return Promise.resolve();
		}
		return this.fetch({ restart: true }).then(noop, noop);
	};

	reset = () => {
		clearTimeout(this.#errorShownTimer);
		this.#errorShownTimer = undefined;
		this.#errorShown = false;
		this.#pending ??= pending();
		this.#set({
			data: undefined,
			error: null,
			failureCount: 0,
			hasData: false,
			isInvalidated: false,
			promise: this.#pending.promise,
			status: "pending",
			updatedAt: 0,
		});
		// An in-flight request restarts too, or its response would restore the
		// data that was just dropped.
		if (!this.#options || (!this.isObserved && !this.#inFlight)) {
			return Promise.resolve();
		}
		return this.fetch({ restart: true }).then(noop, noop);
	};

	/** Write data directly, as if a request had returned it. */
	setData(data: unknown, updatedAt = Date.now()) {
		this.#succeed(data, updatedAt);
	}

	/** Adopt a request started elsewhere (the server's, during hydration). */
	resume(promise: PromiseLike<unknown>) {
		if (this.#state.hasData || this.#inFlight) {
			return;
		}
		this.#start(
			Effect.tryPromise({
				catch: identity,
				try: () => Promise.resolve(promise),
			}),
			undefined,
		).catch(noop);
	}

	/** Refetch a read, stale entry whose readers want it on this event. */
	onWindowEvent(event: "focus" | "reconnect") {
		const option =
			event === "focus" ? "refetchOnWindowFocus" : "refetchOnReconnect";
		const fallback = this.#behavior(option) ?? true;
		const wanted = [...this.#listeners.values()].some(
			(observer) => observer[option] ?? fallback,
		);
		if (wanted && this.#computeStale(this.#state)) {
			this.fetch().catch(noop);
		}
	}

	/** Stop timers and abort the in-flight request; the entry is leaving the cache. */
	destroy() {
		clearTimeout(this.#gcTimer);
		clearTimeout(this.#staleTimer);
		clearTimeout(this.#errorShownTimer);
		const inFlight = this.#inFlight;
		this.#inFlight = undefined;
		if (inFlight) {
			inFlight.controller.abort();
			inFlight.deferred.reject(new CancelledError());
		}
	}

	#behavior<TName extends keyof QueryBehavior>(
		name: TName,
	): QueryBehavior[TName] {
		return this.#options?.[name] ?? this.#host.defaults[name];
	}

	#computeStale(state: QueryState<unknown>) {
		if (state.isInvalidated || !state.hasData) {
			return true;
		}
		const staleTime = this.#behavior("staleTime") ?? 0;
		return Date.now() - state.updatedAt >= staleTime;
	}

	#set(patch: Partial<QueryState<unknown>>) {
		const next = { ...this.#state, ...patch };
		this.#state = { ...next, isStale: this.#computeStale(next) };
		for (const listener of this.#listeners.keys()) {
			scheduleNotify(listener);
		}
		this.#host.changed(this);
		this.#scheduleStale();
	}

	#start(
		request: Effect.Effect<unknown, unknown>,
		direction: "backward" | "forward" | undefined,
	) {
		const deferred = this.#inFlight?.deferred ?? pending<unknown>();
		const run: InFlight = { controller: new AbortController(), deferred };
		this.#inFlight = run;
		this.#clearGc();
		if (!this.#state.hasData && this.#state.status === "error") {
			this.#pending = pending();
			this.#set({
				error: null,
				failureCount: 0,
				fetchDirection: direction,
				isFetching: true,
				promise: this.#pending.promise,
				status: "pending",
			});
		} else {
			this.#set({
				failureCount: 0,
				fetchDirection: direction,
				isFetching: true,
			});
		}
		Effect.runPromiseExit(request, { signal: run.controller.signal }).then(
			(exit) => this.#settle(run, exit),
			noop,
		);
		return deferred.promise;
	}

	#settle(run: InFlight, exit: Exit.Exit<unknown, unknown>) {
		if (this.#inFlight !== run) {
			return;
		}
		this.#inFlight = undefined;
		if (Exit.isSuccess(exit)) {
			this.#succeed(exit.value, Date.now());
			run.deferred.resolve(exit.value);
		} else if (Cause.hasInterruptsOnly(exit.cause)) {
			this.#set({ fetchDirection: undefined, isFetching: false });
			run.deferred.reject(new CancelledError());
		} else {
			const error = Cause.squash(exit.cause);
			this.#fail(error);
			run.deferred.reject(error);
		}
		this.#scheduleGc();
	}

	#succeed(data: unknown, updatedAt: number) {
		const firstLoad = this.#pending;
		this.#pending = undefined;
		firstLoad?.resolve(data);
		this.#set({
			data,
			error: null,
			failureCount: 0,
			fetchDirection: undefined,
			hasData: true,
			isFetching: false,
			isInvalidated: false,
			promise: firstLoad ? firstLoad.promise : fulfilled(data),
			status: "success",
			updatedAt,
		});
	}

	#fail(error: unknown) {
		this.#host.reportError(error, this);
		if (!this.#state.hasData) {
			const firstLoad = this.#pending;
			this.#pending = undefined;
			firstLoad?.reject(error);
			this.#errorShown = false;
		}
		this.#set({
			error,
			fetchDirection: undefined,
			isFetching: false,
			status: "error",
		});
	}

	/**
	 * A failed first load rejects its promise, so the reader throws to an error
	 * boundary. Every read in that same task (React retries a throwing render
	 * once, StrictMode renders twice) gets the rejection too; a read in a later
	 * task — the boundary was reset — starts a new request.
	 */
	#markErrorShown() {
		if (this.#errorShownTimer !== undefined) {
			return;
		}
		this.#errorShownTimer = setTimeout(() => {
			this.#errorShownTimer = undefined;
			this.#errorShown = true;
		}, 0);
	}

	#request(
		options: AnyQueryOptions,
		request: FetchRequest,
	): Effect.Effect<unknown, unknown> {
		if (options.kind === "query") {
			return this.#attempt((signal) =>
				options.queryFn({ queryKey: options.queryKey, signal }),
			);
		}
		return this.#pagedRequest(options, request);
	}

	#pagedRequest(
		options: InfiniteQueryOptions<unknown, unknown>,
		request: FetchRequest,
	): Effect.Effect<InfiniteData<unknown, unknown>, unknown> {
		const current = isInfiniteData(this.#state.data)
			? this.#state.data
			: undefined;
		const fetchPage = (pageParam: unknown, direction: "backward" | "forward") =>
			this.#attempt((signal) =>
				options.queryFn({
					direction,
					pageParam,
					queryKey: options.queryKey,
					signal,
				}),
			);

		return Effect.gen(function* () {
			if (request.direction && current) {
				const pageParam =
					request.direction === "forward"
						? nextPageParam(options, current)
						: previousPageParam(options, current);
				if (pageParam == null) {
					return current;
				}
				const page = yield* fetchPage(pageParam, request.direction);
				return addPage(
					current,
					page,
					pageParam,
					request.direction,
					options.maxPages,
				);
			}

			const count = Math.max(request.pages ?? 1, current?.pages.length ?? 0);
			let data: InfiniteData<unknown, unknown> = { pageParams: [], pages: [] };
			let pageParam =
				current && current.pageParams.length > 0
					? current.pageParams[0]
					: options.initialPageParam;
			for (let index = 0; index < count; index++) {
				if (index > 0) {
					const next = nextPageParam(options, data);
					if (next == null) {
						break;
					}
					pageParam = next;
				}
				const page = yield* fetchPage(pageParam, "forward");
				data = addPage(data, page, pageParam, "forward", options.maxPages);
			}
			return data;
		});
	}

	/** One request: run the `queryFn` with a fresh signal, retrying per policy. */
	#attempt(
		call: (signal: AbortSignal) => QueryFnResult<unknown>,
	): Effect.Effect<unknown, unknown> {
		const once = Effect.suspend(() => {
			const controller = new AbortController();
			return Effect.try({
				catch: identity,
				try: () => call(controller.signal),
			}).pipe(
				Effect.flatMap((result) =>
					isEffectResult(result)
						? result
						: Effect.tryPromise({
								catch: identity,
								try: () => Promise.resolve(result),
							}),
				),
				Effect.onInterrupt(() => Effect.sync(() => controller.abort())),
			);
		});
		return this.#withRetry(once);
	}

	#withRetry(
		once: Effect.Effect<unknown, unknown>,
	): Effect.Effect<unknown, unknown> {
		const retry = this.#behavior("retry") ?? (this.#host.isServer ? 0 : 3);
		const countFailure = Effect.sync(() =>
			this.#set({ failureCount: this.#state.failureCount + 1 }),
		);
		const counted = once.pipe(Effect.tapError(() => countFailure));
		if (Schedule.isSchedule(retry)) {
			return Effect.retry(counted, retry);
		}
		const retryDelay = this.#behavior("retryDelay");
		const delayFor = (failureCount: number, error: unknown) => {
			if (retryDelay === undefined) {
				return Math.min(1000 * 2 ** (failureCount - 1), 30_000);
			}
			return Predicate.isNumber(retryDelay)
				? retryDelay
				: retryDelay(failureCount, error);
		};
		const attempt: Effect.Effect<unknown, unknown> = counted.pipe(
			Effect.catch((error) => {
				const failureCount = this.#state.failureCount;
				if (!shouldRetry(retry, failureCount, error)) {
					return Effect.fail(error);
				}
				return Effect.sleep(delayFor(failureCount, error)).pipe(
					Effect.andThen(Effect.suspend(() => attempt)),
				);
			}),
		);
		return attempt;
	}

	#clearGc() {
		clearTimeout(this.#gcTimer);
		this.#gcTimer = undefined;
	}

	#scheduleGc() {
		this.#clearGc();
		if (this.isObserved || this.#inFlight) {
			return;
		}
		const gcTime =
			this.#behavior("gcTime") ?? (this.#host.isServer ? Infinity : 300_000);
		if (Number.isFinite(gcTime)) {
			this.#gcTimer = setTimeout(() => this.#host.remove(this), gcTime);
		}
	}

	#scheduleStale() {
		clearTimeout(this.#staleTimer);
		const state = this.#state;
		if (this.#host.isServer || !this.isObserved || state.isStale) {
			return;
		}
		const staleTime = this.#behavior("staleTime") ?? 0;
		if (!Number.isFinite(staleTime)) {
			return;
		}
		const remaining = state.updatedAt + staleTime - Date.now();
		this.#staleTimer = setTimeout(
			() => this.#set({}),
			Math.max(remaining, 0) + 1,
		);
	}
}
