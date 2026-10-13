import type { Event as CacheEvent } from "./cache.ts";
import { unsafeCast } from "./cast.ts";
import { type Clock, sleep } from "./clock.ts";
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
	QueryHandle,
	QueryMeta,
} from "./options.ts";
import { cancelled, died, type Outcome, succeeded } from "./outcome.ts";
import { type Platform, type PlatformEvent, whenOnline } from "./platform.ts";
import { hasProperty } from "./predicate.ts";
import type { FetchRequest, Query, State, SubscribeOptions } from "./query.ts";
import { callQueryFn, type EffectServices } from "./request.ts";
import { startRetries } from "./retry.ts";
import { replaceEqualDeep } from "./share.ts";
import { fulfilled, type Pending, pending, type Thenable } from "./thenable.ts";

export const TypeId = "~@raf-query/core/Query";

/** The state a cache shares with its entries. */
export interface CacheState {
	readonly clock: Clock;
	/** Set by `dispose`: entries are gone, and new requests are cancelled. */
	closed: boolean;
	readonly defaults: QueryBehavior;
	readonly entries: Map<string, Entry>;
	readonly isServer: boolean;
	readonly listeners: Set<(event: CacheEvent) => void>;
	readonly platform: Platform;
	/** Runs Effect `queryFn`s; `QueryCache.fromCache` adds one if missing. */
	services: EffectServices | undefined;
}

/** An entry's timers, at most one of each. */
type Timer = "errorShown" | "gc" | "stale";

interface Commands {
	fetchNextPage(): Promise<void>;
	fetchPreviousPage(): Promise<void>;
	refetch(): Promise<void>;
}

/** A cache entry: a {@link Query} and the state behind it. */
export interface Entry extends Query {
	readonly cache: CacheState;
	/** One function per command, so readers can compare them by identity. */
	readonly commands: Commands;
	/**
	 * What its Effect requests run with: the latest verb caller's services
	 * over the cache's ({@link provide}); `undefined` for the cache's own.
	 */
	context: unknown;
	/** A failed first load was shown; the next read retries it. */
	errorShown: boolean;
	/** `failureCount` before the request in flight, restored if it's cancelled. */
	failureCountBefore: number;
	handle: QueryHandle;
	/** `meta` sent with dehydrated state, for an entry no factory call has reached. */
	hydratedMeta: QueryMeta | undefined;
	/** Settles every caller of the request in flight; outlives restarts. */
	inFlight: PromiseWithResolvers<Outcome> | undefined;
	readonly listeners: Map<() => void, SubscribeOptions>;
	/** Called once when the entry leaves its cache. */
	readonly onRemove: Set<() => void>;
	options: AnyQueryOptions | undefined;
	/** The first load's promise, until it settles. */
	pending: Pending<unknown> | undefined;
	removed: boolean;
	/**
	 * Aborts the request running now. A restart aborts it and starts another
	 * for the same `inFlight`; only the latest one's outcome is kept.
	 */
	request: AbortController | undefined;
	/** The last reader left during the request in flight: it retries no more. */
	retriesStopped: boolean;
	/**
	 * The request in flight read its `signal`, or returned an Effect, so
	 * aborting it cancels its work (TanStack's `abortSignalConsumed`).
	 */
	signalRead: boolean;
	state: State<unknown>;
	readonly timers: Map<Timer, () => void>;
}

const Proto = {
	[TypeId]: { _A: (value: never) => value, _E: (value: never) => value },
};

const defaultSubscribeOptions: SubscribeOptions = {};

const noop = () => {};

export function isQuery(value: unknown): value is Query {
	return hasProperty(value, TypeId);
}

export function entryOf<TData, TFactory extends QueryFactory, TError>(
	query: Query<TData, TFactory, TError>,
): Entry {
	// SAFETY: `make` below creates every value that carries `TypeId`, and the
	// public `Query` type is how those entries leave this module.
	return unsafeCast<Entry>(query);
}

export function emit(cache: CacheState, event: CacheEvent) {
	for (const listener of cache.listeners) {
		listener(event);
	}
}

export function make(cache: CacheState, key: QueryKey, hash: string): Entry {
	const first = pending<unknown>();
	const entry: Entry = Object.assign(Object.create(Proto), {
		cache,
		context: undefined,
		errorShown: false,
		failureCountBefore: 0,
		handle: { input: undefined, key },
		hash,
		hydratedMeta: undefined,
		inFlight: undefined,
		key,
		listeners: new Map(),
		onRemove: new Set(),
		options: undefined,
		pending: first,
		removed: false,
		request: undefined,
		retriesStopped: false,
		signalRead: false,
		state: {
			data: undefined,
			error: null,
			failureCount: 0,
			fetchDirection: undefined,
			hasData: false,
			isFetching: false,
			isInvalidated: false,
			isStale: true,
			promise: first.promise,
			status: "pending",
			updatedAt: 0,
		},
		timers: new Map(),
	});
	const commands: Commands = {
		fetchNextPage: () => fetch(entry, { direction: "forward" }).then(noop),
		fetchPreviousPage: () => fetch(entry, { direction: "backward" }).then(noop),
		refetch: () => fetch(entry).then(noop),
	};
	Object.assign(entry, { commands });
	scheduleGc(entry);
	return entry;
}

// Reads

export function now(entry: Entry) {
	return entry.cache.clock.now();
}

/** Readers are subscribed; `invalidate` and focus refetch only what is read. */
export function isObserved(entry: Entry) {
	return entry.listeners.size > 0;
}

function behavior<TName extends keyof QueryBehavior>(
	entry: Entry,
	name: TName,
): QueryBehavior[TName] {
	return entry.options?.[name] ?? entry.cache.defaults[name];
}

/** Until a factory call attaches options, `meta` comes from hydration. */
export function metaOf(entry: Entry): QueryMeta | undefined {
	return entry.options
		? behavior(entry, "meta")
		: (entry.hydratedMeta ?? entry.cache.defaults.meta);
}

function computeStale(entry: Entry, state: State<unknown>) {
	if (state.isInvalidated || !state.hasData) {
		return true;
	}
	const staleTime = behavior(entry, "staleTime") ?? 0;
	return now(entry) - state.updatedAt >= staleTime;
}

export function isStaleUnsafe(entry: Entry) {
	return computeStale(entry, entry.state);
}

export function hasNextPageUnsafe(entry: Entry) {
	const options = entry.options;
	const data = entry.state.data;
	return (
		options?.kind === "infinite" &&
		isInfiniteData(data) &&
		nextPageParam(options, data) != null
	);
}

export function hasPreviousPageUnsafe(entry: Entry) {
	const options = entry.options;
	const data = entry.state.data;
	return (
		options?.kind === "infinite" &&
		isInfiniteData(data) &&
		previousPageParam(options, data) != null
	);
}

// Subscriptions

export function subscribeUnsafe(
	entry: Entry,
	listener: () => void,
	options = defaultSubscribeOptions,
): () => void {
	entry.listeners.set(listener, options);
	entry.retriesStopped = false;
	cancelTimer(entry, "gc");
	scheduleStale(entry);
	emit(entry.cache, { query: entry, type: "observers" });
	return () => {
		if (!entry.listeners.delete(listener)) {
			return;
		}
		if (entry.listeners.size === 0) {
			cancelTimer(entry, "stale");
			scheduleGc(entry);
			const inFlight = entry.inFlight;
			if (inFlight) {
				// React unsubscribes and resubscribes in one commit (StrictMode,
				// a route swapping in a page that reads the same query), so the
				// decision waits until that commit is done.
				scheduleNotify(() => unobserved(entry, inFlight));
			}
		}
		emit(entry.cache, { query: entry, type: "observers" });
	};
}

// Requests

/** Run this entry's Effect requests with `context` from now on. */
export function provide(entry: Entry, context: unknown) {
	entry.context = context;
}

/** Attach the options and input of the latest factory call. */
export function setOptions(
	entry: Entry,
	options: AnyQueryOptions,
	input: unknown,
) {
	entry.options = options;
	if (entry.handle.input !== input) {
		entry.handle = { input, key: entry.key };
	}
}

/**
 * The promise a render should unwrap. Starts the first request if nothing
 * has, and retries a failed first load once its error has been shown.
 */
export function readUnsafe(entry: Entry): Thenable<unknown> {
	const state = entry.state;
	if (!state.hasData && !state.isFetching) {
		if (state.status !== "error" || entry.errorShown) {
			begin(entry, {});
		} else {
			markErrorShown(entry);
		}
	}
	return entry.state.promise;
}

/** Start a request unless one is in flight, without waiting for it. */
export function start(entry: Entry) {
	begin(entry, {});
}

/**
 * Background refetch of cached data that was asked for again. A server cache
 * renders once, so a refetch there could only duplicate a request whose
 * result is never shown; it refetches only what `invalidate` marked.
 */
export function revalidate(entry: Entry) {
	const state = entry.state;
	if (!state.hasData || state.isFetching) {
		return;
	}
	const wanted = entry.cache.isServer
		? state.isInvalidated
		: isStaleUnsafe(entry);
	if (wanted) {
		start(entry);
	}
}

/** Start a request, or join the one in flight, and wait for its outcome. */
export async function fetch(
	entry: Entry,
	request: FetchRequest = {},
): Promise<Outcome> {
	const inFlight = entry.inFlight;
	if (inFlight && request.direction && !request.restart) {
		// A page joins the list the in-flight request returns.
		await inFlight.promise;
		return fetch(entry, request);
	}
	return begin(entry, request);
}

export function invalidate(entry: Entry): Promise<void> {
	set(entry, { isInvalidated: true });
	if (!isObserved(entry) || !entry.options) {
		return Promise.resolve();
	}
	return begin(entry, { restart: true }).then(noop);
}

export function reset(entry: Entry): Promise<void> {
	cancelTimer(entry, "errorShown");
	entry.errorShown = false;
	entry.pending ??= pending();
	set(entry, {
		data: undefined,
		error: null,
		failureCount: 0,
		hasData: false,
		isInvalidated: false,
		promise: entry.pending.promise,
		status: "pending",
		updatedAt: 0,
	});
	// An in-flight request restarts too, or its response would restore the
	// data that was just dropped.
	if (!entry.options || (!isObserved(entry) && !entry.inFlight)) {
		return Promise.resolve();
	}
	return begin(entry, { restart: true }).then(noop);
}

/** Write data directly, as if a request had returned it. */
export function setData(entry: Entry, data: unknown, updatedAt = now(entry)) {
	succeed(entry, data, updatedAt);
}

/** Adopt a request started elsewhere (the server's, during hydration). */
export function resume(entry: Entry, promise: PromiseLike<unknown>) {
	if (entry.state.hasData || entry.inFlight) {
		return;
	}
	// The sender's error type doesn't survive the trip, so a rejection is
	// a defect.
	startRequest(
		entry,
		() => Promise.resolve(promise).then(succeeded, died),
		undefined,
	);
}

/** Refetch a read, stale entry whose readers want it on this event. */
export function onPlatformEvent(entry: Entry, event: PlatformEvent) {
	const option =
		event === "focus" ? "refetchOnWindowFocus" : "refetchOnReconnect";
	const fallback = behavior(entry, option) ?? true;
	const wanted = [...entry.listeners.values()].some(
		(options) => options[option] ?? fallback,
	);
	if (wanted && isStaleUnsafe(entry)) {
		start(entry);
	}
}

/** Take `entry` out of its cache: abort its request and cancel its awaiters. */
export function remove(entry: Entry) {
	const cache = entry.cache;
	if (cache.entries.get(entry.hash) !== entry) {
		return;
	}
	cache.entries.delete(entry.hash);
	entry.removed = true;
	for (const cancel of entry.timers.values()) {
		cancel();
	}
	entry.timers.clear();
	entry.request?.abort();
	entry.request = undefined;
	const inFlight = entry.inFlight;
	entry.inFlight = undefined;
	inFlight?.resolve(cancelled());
	for (const finalizer of entry.onRemove) {
		finalizer();
	}
	entry.onRemove.clear();
	emit(cache, { query: entry, type: "removed" });
}

function isClosed(entry: Entry) {
	return entry.removed || entry.cache.closed;
}

/**
 * Start a request now, or join the one in flight; resolves with its
 * outcome.
 */
function begin(entry: Entry, request: FetchRequest): Promise<Outcome> {
	if (isClosed(entry)) {
		return Promise.resolve(cancelled());
	}
	const options = entry.options;
	const inFlight = entry.inFlight;
	if (inFlight && !(request.restart && options)) {
		return inFlight.promise;
	}
	if (!options) {
		return Promise.resolve(entry.state.promise).then(succeeded, died);
	}
	return startRequest(
		entry,
		(signal) => requestFor(entry, options, request, signal),
		request.direction,
	);
}

function set(entry: Entry, patch: Partial<State<unknown>>) {
	const next = { ...entry.state, ...patch };
	entry.state = { ...next, isStale: computeStale(entry, next) };
	for (const listener of entry.listeners.keys()) {
		scheduleNotify(listener);
	}
	emit(entry.cache, { query: entry, type: "updated" });
	scheduleStale(entry);
}

/**
 * Run `run` as the entry's request, replacing any running one, and settle
 * the entry's awaiters with its outcome.
 */
function startRequest(
	entry: Entry,
	run: (signal: AbortSignal) => Promise<Outcome>,
	direction: Direction | undefined,
): Promise<Outcome> {
	if (!entry.inFlight) {
		entry.failureCountBefore = entry.state.failureCount;
	}
	const inFlight = entry.inFlight ?? Promise.withResolvers<Outcome>();
	entry.inFlight = inFlight;
	entry.request?.abort();
	const controller = new AbortController();
	entry.request = controller;
	entry.retriesStopped = false;
	entry.signalRead = false;
	cancelTimer(entry, "gc");
	if (!entry.state.hasData && entry.state.status === "error") {
		entry.pending = pending();
		set(entry, {
			error: null,
			failureCount: 0,
			fetchDirection: direction,
			isFetching: true,
			promise: entry.pending.promise,
			status: "pending",
		});
	} else {
		set(entry, {
			failureCount: 0,
			fetchDirection: direction,
			isFetching: true,
		});
	}
	void run(controller.signal).then((outcome) => {
		if (entry.request === controller) {
			settle(entry, outcome);
		}
	});
	return inFlight.promise;
}

function settle(entry: Entry, outcome: Outcome) {
	const inFlight = entry.inFlight;
	entry.inFlight = undefined;
	entry.request = undefined;
	if (outcome.kind === "success") {
		const data = succeed(entry, outcome.value, now(entry));
		inFlight?.resolve(succeeded(data));
	} else if (outcome.kind === "cancelled") {
		set(entry, { fetchDirection: undefined, isFetching: false });
		inFlight?.resolve(outcome);
	} else {
		fail(entry, outcome.kind === "failure" ? outcome.error : outcome.defect);
		inFlight?.resolve(outcome);
	}
	scheduleGc(entry);
}

/**
 * The last reader left while `inFlight`'s request was running. A refetch
 * whose work aborting cancels (`signalRead`) is aborted, and the entry goes
 * back to its state before the request; its awaiters get the cached data.
 * Any other request finishes, so its result is cached, but runs no more
 * retries.
 */
function unobserved(entry: Entry, inFlight: PromiseWithResolvers<Outcome>) {
	if (isObserved(entry) || entry.inFlight !== inFlight) {
		return;
	}
	// A render suspended on a first load isn't subscribed. It waits on
	// `entry.pending`, which an aborted request leaves pending until a later
	// read, so a first load always finishes.
	if (!entry.signalRead || !entry.state.hasData) {
		entry.retriesStopped = true;
		return;
	}
	entry.inFlight = undefined;
	entry.request?.abort();
	entry.request = undefined;
	set(entry, {
		failureCount: entry.failureCountBefore,
		fetchDirection: undefined,
		isFetching: false,
	});
	inFlight.resolve(succeeded(entry.state.data));
	scheduleGc(entry);
}

function succeed(entry: Entry, next: unknown, updatedAt: number) {
	const previous = entry.state;
	const data =
		previous.hasData && behavior(entry, "structuralSharing") !== false
			? replaceEqualDeep(previous.data, next)
			: next;
	const firstLoad = entry.pending;
	entry.pending = undefined;
	firstLoad?.resolve(data);
	const unchanged = previous.hasData && data === previous.data;
	set(entry, {
		data,
		error: null,
		failureCount: 0,
		fetchDirection: undefined,
		hasData: true,
		isFetching: false,
		isInvalidated: false,
		promise:
			firstLoad?.promise ?? (unchanged ? previous.promise : fulfilled(data)),
		status: "success",
		updatedAt,
	});
	return data;
}

function fail(entry: Entry, error: unknown) {
	emit(entry.cache, { error, query: entry, type: "failed" });
	if (!entry.state.hasData) {
		const firstLoad = entry.pending;
		entry.pending = undefined;
		firstLoad?.reject(error);
		entry.errorShown = false;
	}
	set(entry, {
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
 * task — the boundary was reset — starts a new request. A real macrotask,
 * not the cache's clock: it marks a task boundary, not a delay.
 */
function markErrorShown(entry: Entry) {
	if (entry.timers.has("errorShown") || isClosed(entry)) {
		return;
	}
	const timer = setTimeout(() => {
		entry.timers.delete("errorShown");
		entry.errorShown = true;
	}, 0);
	entry.timers.set("errorShown", () => clearTimeout(timer));
}

function requestFor(
	entry: Entry,
	options: AnyQueryOptions,
	request: FetchRequest,
	signal: AbortSignal,
): Promise<Outcome> {
	const meta = metaOf(entry);
	const queryKey = options.queryKey;
	const readSignal = () => {
		entry.signalRead = true;
		return signal;
	};
	if (options.kind === "query") {
		return attempt(entry, signal, () =>
			options.queryFn({
				meta,
				queryKey,
				get signal() {
					return readSignal();
				},
			}),
		);
	}
	const current = isInfiniteData(entry.state.data)
		? entry.state.data
		: undefined;
	return fetchPages(options, current, request, (pageParam, direction) =>
		attempt(entry, signal, () =>
			options.queryFn({
				direction,
				meta,
				pageParam,
				queryKey,
				get signal() {
					return readSignal();
				},
			}),
		),
	);
}

/**
 * One `queryFn` call, retried per the query's policy until it succeeds,
 * dies, or the policy, the readers leaving or `signal` stop it. Every
 * failure counts. Retries wait while the browser is offline; the first
 * attempt doesn't.
 */
async function attempt(
	entry: Entry,
	signal: AbortSignal,
	call: () => unknown,
): Promise<Outcome> {
	const cache = entry.cache;
	const services = {
		context: entry.context ?? cache.services?.context,
		services: cache.services,
	};
	const onEffect = () => {
		entry.signalRead = true;
	};
	const next = startRetries(
		{
			retry: behavior(entry, "retry"),
			retryDelay: behavior(entry, "retryDelay"),
		},
		cache.isServer,
		() => cache.clock.now(),
	);
	for (let failureCount = 1; ; failureCount++) {
		const outcome = await callQueryFn(call, signal, services, onEffect);
		if (signal.aborted || outcome.kind !== "failure") {
			return outcome;
		}
		set(entry, { failureCount: entry.state.failureCount + 1 });
		const delay = entry.retriesStopped
			? undefined
			: next?.(failureCount, outcome.error);
		if (delay === undefined || !(await waitToRetry(entry, delay, signal))) {
			return outcome;
		}
	}
}

/** Wait out a retry's delay, then the network. `false`: don't retry. */
async function waitToRetry(entry: Entry, delay: number, signal: AbortSignal) {
	const cache = entry.cache;
	await sleep(cache.clock, delay, signal);
	if (signal.aborted || entry.retriesStopped) {
		return false;
	}
	if (!cache.isServer) {
		await whenOnline(cache.platform, signal);
	}
	return !signal.aborted && !entry.retriesStopped;
}

function cancelTimer(entry: Entry, timer: Timer) {
	entry.timers.get(timer)?.();
	entry.timers.delete(timer);
}

function startTimer(entry: Entry, timer: Timer, ms: number, run: () => void) {
	cancelTimer(entry, timer);
	if (isClosed(entry)) {
		return;
	}
	const cancel = entry.cache.clock.schedule(() => {
		entry.timers.delete(timer);
		run();
	}, ms);
	entry.timers.set(timer, cancel);
}

function scheduleGc(entry: Entry) {
	const gcTime =
		behavior(entry, "gcTime") ?? (entry.cache.isServer ? Infinity : 300_000);
	if (isObserved(entry) || entry.inFlight || !Number.isFinite(gcTime)) {
		cancelTimer(entry, "gc");
		return;
	}
	startTimer(entry, "gc", gcTime, () => remove(entry));
}

function scheduleStale(entry: Entry) {
	const state = entry.state;
	const staleTime = behavior(entry, "staleTime") ?? 0;
	if (
		entry.cache.isServer ||
		!isObserved(entry) ||
		state.isStale ||
		!Number.isFinite(staleTime)
	) {
		cancelTimer(entry, "stale");
		return;
	}
	const remaining = state.updatedAt + staleTime - now(entry);
	startTimer(entry, "stale", Math.max(remaining, 0) + 1, () => set(entry, {}));
}
