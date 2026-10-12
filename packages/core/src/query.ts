import {
	Cause,
	Data,
	Deferred,
	Effect,
	Exit,
	FiberMap,
	Predicate,
	Scope,
} from "effect";

import {
	type Direction,
	fetchPages,
	isInfiniteData,
	nextPageParam,
	previousPageParam,
} from "./infinite.ts";
import type { QueryKey } from "./key.ts";
import { scheduleNotify } from "./notify.ts";
import type {
	AnyQueryOptions,
	QueryBehavior,
	QueryFactory,
	QueryFnResult,
	QueryHandle,
} from "./options.ts";
import { fromQueryFn } from "./request.ts";
import { retrySchedule } from "./retry.ts";
import { fulfilled, type Pending, pending } from "./thenable.ts";

/** A snapshot of one cache entry. Replaced, never mutated, on every change. */
export interface QueryState<TData> {
	/** Last successful data, kept through background errors. */
	readonly data: TData | undefined;
	/** Error of the last failed request, or `null`. */
	readonly error: unknown;
	/** Failed attempts of the current request, retries included. */
	readonly failureCount: number;
	/** Set while a paged query loads a page at one end of the list. */
	readonly fetchDirection: Direction | undefined;
	readonly hasData: boolean;
	/** A request is in flight. */
	readonly isFetching: boolean;
	/** Marked stale by `invalidate`; cleared by the next successful request. */
	readonly isInvalidated: boolean;
	/** Older than `staleTime`, invalidated, or without data. */
	readonly isStale: boolean;
	/**
	 * Settles with `data`. A new promise is created per data version, already
	 * fulfilled once data exists, so React's `use()` reads it synchronously.
	 */
	readonly promise: Promise<TData>;
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
	readonly direction?: Direction;
	/** Pages to load when a paged query has none yet. */
	readonly pages?: number;
	/** Interrupt an in-flight request and start over (used by `invalidate`). */
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

/**
 * The failure of a request that was interrupted rather than settled: its
 * entry was removed or cleared, or an Effect `queryFn` was interrupted.
 */
export class CancelledError extends Data.TaggedError("CancelledError") {
	override readonly message = "The query was cancelled";
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

/** The background work of an entry, one fiber per kind. */
type Task = "errorShown" | "gc" | "request" | "stale";

const identity = <T>(value: T) => value;
const defaultObserver: QueryObserver = {};

/**
 * Fibers keyed by task, owned by `scope`: forking a task interrupts its
 * previous fiber, and closing the scope interrupts them all.
 */
function makeTasks(scope: Scope.Scope) {
	const tasks = Effect.runSync(
		FiberMap.make<Task, void, never>().pipe(Scope.provide(scope)),
	);
	const run = Effect.runSync(FiberMap.runtime(tasks)<never>());
	return {
		cancel(task: Task) {
			if (FiberMap.hasUnsafe(tasks, task)) {
				Effect.runFork(FiberMap.remove(tasks, task));
			}
		},
		fork(
			task: Task,
			effect: Effect.Effect<void>,
			options?: { readonly onlyIfMissing?: boolean },
		) {
			run(task, effect, options);
		},
	};
}

export class QueryEntry implements Query {
	/** Effect versions of the entry's async methods. */
	readonly effect: {
		fetch(request?: FetchRequest): Effect.Effect<unknown, unknown>;
		readonly invalidate: Effect.Effect<void>;
		readonly reset: Effect.Effect<void>;
	};
	readonly hash: string;
	readonly key: QueryKey;
	#errorShown = false;
	#handle: QueryHandle;
	#host: QueryHost;
	/** Awaited by every caller of the request in flight; outlives restarts. */
	#inFlight: Deferred.Deferred<unknown, unknown> | undefined;
	#listeners = new Map<() => void, QueryObserver>();
	#options: AnyQueryOptions | undefined;
	#pending: Pending<unknown> | undefined;
	/** Open while the entry is cached. */
	#scope = Scope.makeUnsafe();
	#state: QueryState<unknown>;
	#tasks = makeTasks(this.#scope);

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
		this.effect = {
			fetch: (request = {}) => Effect.suspend(() => this.#load(request)),
			invalidate: Effect.suspend(() => this.#invalidate()),
			reset: Effect.suspend(() => this.#reset()),
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
		this.#tasks.cancel("gc");
		this.#scheduleStale();
		this.#host.observersChanged(this);
		return () => {
			if (!this.#listeners.delete(listener)) {
				return;
			}
			if (this.#listeners.size === 0) {
				this.#tasks.cancel("stale");
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
				this.start();
			} else {
				this.#markErrorShown();
			}
		}
		return this.#state.promise;
	};

	/** Start a request unless one is in flight, without waiting for it. */
	start(request: FetchRequest = {}) {
		this.#begin(request);
	}

	fetch = (request?: FetchRequest) =>
		Effect.runPromise(this.effect.fetch(request));

	refetch = () => Effect.runPromise(Effect.ignore(this.effect.fetch()));

	fetchNextPage = () =>
		Effect.runPromise(
			Effect.ignore(this.effect.fetch({ direction: "forward" })),
		);

	fetchPreviousPage = () =>
		Effect.runPromise(
			Effect.ignore(this.effect.fetch({ direction: "backward" })),
		);

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

	invalidate = () => Effect.runPromise(this.effect.invalidate);

	reset = () => Effect.runPromise(this.effect.reset);

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
		);
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
			this.start();
		}
	}

	/**
	 * The entry is leaving the cache: interrupt its request and timers, and
	 * fail the request's awaiters with a {@link CancelledError}.
	 */
	destroy() {
		const inFlight = this.#inFlight;
		this.#inFlight = undefined;
		Effect.runFork(Scope.close(this.#scope, Exit.void));
		if (inFlight) {
			Deferred.doneUnsafe(inFlight, Exit.fail(new CancelledError()));
		}
	}

	#load(request: FetchRequest): Effect.Effect<unknown, unknown> {
		const inFlight = this.#inFlight;
		if (inFlight && request.direction && !request.restart) {
			// A page joins the list the in-flight request returns.
			return Deferred.await(inFlight).pipe(
				Effect.exit,
				Effect.andThen(this.effect.fetch(request)),
			);
		}
		return this.#begin(request);
	}

	/**
	 * Start a request now, or join the one in flight. The returned Effect
	 * waits for its result.
	 */
	#begin(request: FetchRequest): Effect.Effect<unknown, unknown> {
		if (Predicate.isTagged(this.#scope.state, "Closed")) {
			return Effect.fail(new CancelledError());
		}
		const options = this.#options;
		const inFlight = this.#inFlight;
		if (inFlight && !(request.restart && options)) {
			return Deferred.await(inFlight);
		}
		if (!options) {
			return Effect.tryPromise({
				catch: identity,
				try: () => this.#state.promise,
			});
		}
		this.#tasks.cancel("request");
		return Deferred.await(
			this.#start(this.#request(options, request), request.direction),
		);
	}

	#invalidate(): Effect.Effect<void> {
		this.#set({ isInvalidated: true });
		if (!this.isObserved || !this.#options) {
			return Effect.void;
		}
		return Effect.ignore(this.#begin({ restart: true }));
	}

	#reset(): Effect.Effect<void> {
		this.#tasks.cancel("errorShown");
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
			return Effect.void;
		}
		return Effect.ignore(this.#begin({ restart: true }));
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

	/** Run `request` as the entry's request fiber, settling into its awaiter. */
	#start(
		request: Effect.Effect<unknown, unknown>,
		direction: Direction | undefined,
	): Deferred.Deferred<unknown, unknown> {
		const awaiter = this.#inFlight ?? Deferred.makeUnsafe<unknown, unknown>();
		this.#inFlight = awaiter;
		this.#tasks.cancel("gc");
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
		this.#tasks.fork(
			"request",
			Effect.exit(request).pipe(
				Effect.flatMap((exit) =>
					Effect.sync(() => this.#settle(awaiter, exit)),
				),
			),
		);
		return awaiter;
	}

	#settle(
		awaiter: Deferred.Deferred<unknown, unknown>,
		exit: Exit.Exit<unknown, unknown>,
	) {
		if (this.#inFlight !== awaiter) {
			return;
		}
		this.#inFlight = undefined;
		if (Exit.isSuccess(exit)) {
			this.#succeed(exit.value, Date.now());
			Deferred.doneUnsafe(awaiter, exit);
		} else if (Cause.hasInterruptsOnly(exit.cause)) {
			this.#set({ fetchDirection: undefined, isFetching: false });
			Deferred.doneUnsafe(awaiter, Exit.fail(new CancelledError()));
		} else {
			const error = Cause.squash(exit.cause);
			this.#fail(error);
			Deferred.doneUnsafe(awaiter, Exit.fail(error));
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
		this.#tasks.fork(
			"errorShown",
			Effect.yieldNow.pipe(
				Effect.andThen(
					Effect.sync(() => {
						this.#errorShown = true;
					}),
				),
			),
			{ onlyIfMissing: true },
		);
	}

	#request(
		options: AnyQueryOptions,
		request: FetchRequest,
	): Effect.Effect<unknown, unknown> {
		const queryKey = options.queryKey;
		if (options.kind === "query") {
			return this.#attempt((signal) => options.queryFn({ queryKey, signal }));
		}
		const current = isInfiniteData(this.#state.data)
			? this.#state.data
			: undefined;
		return fetchPages(options, current, request, (pageParam, direction) =>
			this.#attempt((signal) =>
				options.queryFn({ direction, pageParam, queryKey, signal }),
			),
		);
	}

	/** One `queryFn` call, retried per the query's policy. Every failure counts. */
	#attempt(
		call: (signal: AbortSignal) => QueryFnResult<unknown>,
	): Effect.Effect<unknown, unknown> {
		const attempt = fromQueryFn(call).pipe(
			Effect.tapError(() =>
				Effect.sync(() =>
					this.#set({ failureCount: this.#state.failureCount + 1 }),
				),
			),
		);
		const schedule = retrySchedule(
			{
				retry: this.#behavior("retry"),
				retryDelay: this.#behavior("retryDelay"),
			},
			this.#host.isServer,
		);
		return schedule ? Effect.retry(attempt, schedule) : attempt;
	}

	#scheduleGc() {
		const gcTime =
			this.#behavior("gcTime") ?? (this.#host.isServer ? Infinity : 300_000);
		if (this.isObserved || this.#inFlight || !Number.isFinite(gcTime)) {
			this.#tasks.cancel("gc");
			return;
		}
		this.#tasks.fork(
			"gc",
			Effect.sleep(gcTime).pipe(
				Effect.andThen(Effect.sync(() => this.#host.remove(this))),
			),
		);
	}

	#scheduleStale() {
		const state = this.#state;
		const staleTime = this.#behavior("staleTime") ?? 0;
		if (
			this.#host.isServer ||
			!this.isObserved ||
			state.isStale ||
			!Number.isFinite(staleTime)
		) {
			this.#tasks.cancel("stale");
			return;
		}
		const remaining = state.updatedAt + staleTime - Date.now();
		this.#tasks.fork(
			"stale",
			Effect.sleep(Math.max(remaining, 0) + 1).pipe(
				Effect.andThen(Effect.sync(() => this.#set({}))),
			),
		);
	}
}
