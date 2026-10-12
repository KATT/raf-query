import type { QueryBehavior } from "@raf-query/core";
import { type Context, Duration, Effect, Option } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import {
	type Direction,
	isInfiniteData,
	nextPageParam,
	type PageRequest,
	previousPageParam,
} from "./infinite.ts";
import type { AnyQueryOptions } from "./options.ts";
import { request } from "./request.ts";
import { replaceEqualDeep } from "./share.ts";
import type { Thenable } from "./thenable.ts";

/**
 * A query's options (plain or paged), with data, error and services erased.
 * The services come from the entry's `services` context.
 */
export type EntryOptions = AnyQueryOptions;

export type Result = AsyncResult.AsyncResult<unknown, unknown>;

/** What every entry of one client shares. */
export interface Store {
	readonly defaults: QueryBehavior;
	readonly isServer: boolean;
	readonly registry: AtomRegistry.AtomRegistry;
	/** The services the cache was built with; every request can read them. */
	readonly services: Context.Context<never>;
}

/** The promises handed out for one entry, shared by every reader. */
export interface Promises {
	failed?: {
		readonly cause: unknown;
		readonly promise: Thenable<unknown>;
		/** An error boundary has had this error, so the next read retries. */
		shown: boolean;
	};
	loaded?: { readonly promise: Thenable<unknown>; readonly value: unknown };
	pending?: Thenable<unknown>;
}

/**
 * One query: two atoms in the client's registry, plus what the registry
 * can't hold.
 */
export interface Entry {
	/**
	 * What the next request does, for paged queries. Set right before the
	 * data atom is rebuilt, and taken by that build.
	 */
	command: PageRequest | undefined;
	/**
	 * The query's `AsyncResult`: its request's, or what `setData` /
	 * hydration wrote. Idles out of the registry `gcTime` after its last
	 * reader leaves.
	 */
	readonly data: Atom.Writable<Result, Result>;
	/** The end a paged request is adding a page to; `undefined` for full loads. */
	fetchDirection: Direction | undefined;
	/** {@link fetchPage} forward, as a Promise function with a stable identity. */
	readonly fetchNextPage: () => Promise<void>;
	/** {@link fetchPage} backward, as a Promise function with a stable identity. */
	readonly fetchPreviousPage: () => Promise<void>;
	readonly hash: string;
	/**
	 * Set by `invalidate` when nothing reads the entry. Refreshing an atom
	 * nobody reads would interrupt its request and leave a node that refetches
	 * on any read, so the next `prefetch` / `ensure` refetches instead.
	 */
	invalidated: boolean;
	/** The latest factory call's options; the request reads them when it runs. */
	options: EntryOptions;
	readonly promises: Promises;
	/** `data`, refetched on window focus and reconnect while read and stale. */
	readonly read: Atom.Atom<Result>;
	/** {@link refetch} as a Promise function with a stable identity. */
	readonly refetch: () => Promise<void>;
	/**
	 * A request started elsewhere (the server's, from hydration). The next
	 * build adopts it instead of calling the `queryFn`.
	 */
	resumed: PromiseLike<unknown> | undefined;
	/**
	 * What the request's Effect runs with: the cache's services, plus those
	 * of the last verb that was handed this entry.
	 */
	services: Context.Context<never>;
	readonly store: Store;
}

/** The query's options merged over the client's defaults. */
export function behavior(entry: Entry): QueryBehavior {
	return behaviorOf(entry.store.defaults, entry.options);
}

function behaviorOf(
	defaults: QueryBehavior,
	options: QueryBehavior,
): QueryBehavior {
	return {
		gcTime: options.gcTime ?? defaults.gcTime,
		refetchOnReconnect:
			options.refetchOnReconnect ?? defaults.refetchOnReconnect,
		refetchOnWindowFocus:
			options.refetchOnWindowFocus ?? defaults.refetchOnWindowFocus,
		retry: options.retry ?? defaults.retry,
		retryDelay: options.retryDelay ?? defaults.retryDelay,
		staleTime: options.staleTime ?? defaults.staleTime,
		structuralSharing: options.structuralSharing ?? defaults.structuralSharing,
	};
}

/** Counts `online` events, like `Atom.windowFocusSignal` counts focus. */
const onlineSignal: Atom.Atom<number> = Atom.readable((get) => {
	let count = 0;
	function update() {
		get.setSelf(++count);
	}
	window.addEventListener("online", update);
	get.addFinalizer(() => {
		window.removeEventListener("online", update);
	});
	return count;
});

const focusOrOnlineSignal: Atom.Atom<number> = Atom.make(
	(get) => get(Atom.windowFocusSignal) + get(onlineSignal),
);

function revalidationSignal(
	settings: QueryBehavior,
	isServer: boolean,
): Atom.Atom<number> | undefined {
	if (isServer) {
		return undefined;
	}
	const focus = settings.refetchOnWindowFocus ?? true;
	const reconnect = settings.refetchOnReconnect ?? true;
	if (focus && reconnect) {
		return focusOrOnlineSignal;
	}
	if (focus) {
		return Atom.windowFocusSignal;
	}
	return reconnect ? onlineSignal : undefined;
}

function millis(value: number): Duration.Duration {
	return Number.isFinite(value) ? Duration.millis(value) : Duration.infinity;
}

/** `next`, keeping the parts equal to `previous` unless the query opts out. */
function shared(entry: Entry, previous: Option.Option<unknown>, next: unknown) {
	return Option.isSome(previous) && behavior(entry).structuralSharing !== false
		? replaceEqualDeep(previous.value, next)
		: next;
}

/**
 * The request a build of the data atom starts: the hydrated one if there
 * is one, else the `queryFn` (per page, for paged queries). Takes the
 * entry's `command` and `resumed`, so each applies to one build.
 */
function startRequest(
	entry: Entry,
	previous: Option.Option<Result>,
): Effect.Effect<unknown, unknown> {
	const page = entry.command ?? {};
	const resumed = entry.resumed;
	entry.command = undefined;
	entry.resumed = undefined;
	entry.fetchDirection = page.direction;
	const current = Option.flatMap(previous, AsyncResult.value);
	// The sender's error type doesn't survive the trip, so a rejection is a
	// defect.
	const effect = resumed
		? Effect.promise(() => Promise.resolve(resumed))
		: request({
				behavior: behavior(entry),
				current: Option.getOrUndefined(current),
				hash: entry.hash,
				isServer: entry.store.isServer,
				options: entry.options,
				page,
				services: entry.services,
			});
	return Effect.map(effect, (data) => shared(entry, current, data));
}

/**
 * An entry for a query hash. `gcTime`, `staleTime` and the revalidation
 * settings are read once here, since they shape the atoms; the request
 * reads the latest options each time it runs.
 */
export function make(store: Store, hash: string, options: EntryOptions): Entry {
	const settings = behaviorOf(store.defaults, options);
	const gcTime = settings.gcTime ?? (store.isServer ? Infinity : 300_000);
	const fetcher = Atom.make((get) => startRequest(entry, get.self<Result>()));
	const data = Atom.writable<Result, Result>(fetcher.read, (ctx, value) => {
		ctx.setSelf(value);
	}).pipe(Atom.setIdleTTL(millis(gcTime)), Atom.withLabel(hash));
	const signal = revalidationSignal(settings, store.isServer);
	const read = Atom.swr(data, {
		focusSignal: signal,
		revalidateOnFocus: signal !== undefined,
		// Queries start in loaders and `prefetch`; a read shows what's there.
		revalidateOnMount: false,
		staleTime: millis(settings.staleTime ?? 0),
	});
	const entry: Entry = {
		command: undefined,
		data,
		fetchDirection: undefined,
		fetchNextPage: () => Effect.runPromise(fetchPage(entry, "forward")),
		fetchPreviousPage: () => Effect.runPromise(fetchPage(entry, "backward")),
		hash,
		invalidated: false,
		options,
		promises: {},
		read,
		refetch: () => Effect.runPromise(refetch(entry)),
		resumed: undefined,
		services: store.services,
		store,
	};
	return entry;
}

/** When the data in `result` was fetched or set; `undefined` before that. */
export function updatedAt(result: Result): number | undefined {
	if (AsyncResult.isSuccess(result)) {
		return result.timestamp;
	}
	if (AsyncResult.isFailure(result)) {
		return Option.getOrUndefined(
			Option.map(result.previousSuccess, (success) => success.timestamp),
		);
	}
	return undefined;
}

/** No request in flight, and the data is missing, invalidated, or older than `staleTime`. */
export function isStaleUnsafe(entry: Entry, result: Result): boolean {
	if (result.waiting) {
		return false;
	}
	if (entry.invalidated) {
		return true;
	}
	const at = updatedAt(result);
	return (
		at === undefined || Date.now() - at >= (behavior(entry).staleTime ?? 0)
	);
}

/**
 * Something holds the data atom: a mounted reader, a suspended one waiting
 * on its promise, or another atom built from it.
 */
export function isReadUnsafe(entry: Entry): boolean {
	const node = entry.store.registry.getNodes().get(entry.data);
	return (
		node !== undefined && (node.listeners.size > 0 || node.children.size > 0)
	);
}

/** The data atom's result if the registry holds one, without building it (which would fetch). */
export function peekUnsafe(entry: Entry): Option.Option<Result> {
	const node = entry.store.registry.getNodes().get(entry.data);
	if (node === undefined || node.currentState() !== "valid") {
		return Option.none();
	}
	return Option.some<Result>(node.value());
}

/** A request is in flight. Doesn't build the atom. */
export function isFetchingUnsafe(entry: Entry): boolean {
	return Option.match(peekUnsafe(entry), {
		onNone: () => false,
		onSome: (result) => result.waiting,
	});
}

/** Refresh the data atom and read it, so the request starts even unread. */
function refreshUnsafe(entry: Entry): Result {
	const registry = entry.store.registry;
	entry.invalidated = false;
	registry.refresh(entry.data);
	return registry.get(entry.data);
}

/**
 * Start the query unless its data is fresh or a request is in flight.
 * Server clients only fetch what's missing or invalidated. Returns the
 * current result.
 * `page` shapes the request this starts (`{ pages }` for a first load).
 */
export function startUnsafe(entry: Entry, page: PageRequest = {}): Result {
	entry.command = page;
	// Reading an atom the registry doesn't hold yet builds it, which starts
	// its first request (taking the command); that result is `waiting`.
	const current = entry.store.registry.get(entry.data);
	if (entry.command === undefined) {
		return current;
	}
	const wanted =
		!entry.store.isServer ||
		entry.invalidated ||
		Option.isNone(AsyncResult.value(current));
	if (wanted && isStaleUnsafe(entry, current)) {
		return refreshUnsafe(entry);
	}
	entry.command = undefined;
	return current;
}

/** Wait until no request is in flight, then succeed or fail with the result. */
function settled(entry: Entry): Effect.Effect<unknown, unknown> {
	return AtomRegistry.getResult(entry.store.registry, entry.data, {
		suspendOnWaiting: true,
	});
}

/**
 * Start the query and succeed with its data: right away when there is
 * some (stale data revalidates in the background), else once the request
 * settles.
 */
export function load(
	entry: Entry,
	page: PageRequest = {},
): Effect.Effect<unknown, unknown> {
	return Effect.suspend(() => {
		const value = AsyncResult.value(startUnsafe(entry, page));
		return Option.isSome(value) ? Effect.succeed(value.value) : settled(entry);
	});
}

/** Refetch now, and wait for the request to settle. Never fails. */
export function refetch(entry: Entry): Effect.Effect<void> {
	return Effect.suspend(() => {
		refreshUnsafe(entry);
		return Effect.ignore(settled(entry));
	});
}

/**
 * Load one more page at `direction`'s end, after the request in flight (a
 * page joins the list that request returns). Without data, loads the first
 * page. Never fails.
 */
export function fetchPage(
	entry: Entry,
	direction: Direction,
): Effect.Effect<void> {
	return Effect.suspend(() => {
		const inFlight = isFetchingUnsafe(entry)
			? Effect.ignore(settled(entry))
			: Effect.void;
		return Effect.andThen(
			inFlight,
			Effect.suspend(() => {
				entry.command = { direction };
				refreshUnsafe(entry);
				return Effect.ignore(settled(entry));
			}),
		);
	});
}

function pagesOf(entry: Entry, result: Result) {
	const options = entry.options;
	const data = Option.getOrUndefined(AsyncResult.value(result));
	return options.kind === "infinite" && isInfiniteData(data)
		? { data, options }
		: undefined;
}

export function hasNextPageUnsafe(entry: Entry, result: Result): boolean {
	const paged = pagesOf(entry, result);
	return (
		paged !== undefined && nextPageParam(paged.options, paged.data) != null
	);
}

export function hasPreviousPageUnsafe(entry: Entry, result: Result): boolean {
	const paged = pagesOf(entry, result);
	return (
		paged !== undefined && previousPageParam(paged.options, paged.data) != null
	);
}

/**
 * Refetch the query if something reads it, and wait for that; otherwise mark
 * it stale for the next `prefetch` / `ensure`.
 */
export function invalidate(entry: Entry): Effect.Effect<void> {
	return Effect.suspend(() => {
		if (isReadUnsafe(entry)) {
			return refetch(entry);
		}
		entry.invalidated = true;
		return Effect.void;
	});
}

/** The cached data, without building the atom (which would fetch). */
export function getDataUnsafe(entry: Entry): Option.Option<unknown> {
	return Option.flatMap(peekUnsafe(entry), AsyncResult.value);
}

/**
 * Write data as if a request had returned it at `at`. Readers re-render
 * with it without suspending; equal data keeps its identity.
 */
export function setDataUnsafe(
	entry: Entry,
	data: unknown,
	at: number = Date.now(),
): void {
	entry.invalidated = false;
	entry.store.registry.set(
		entry.data,
		AsyncResult.success(shared(entry, getDataUnsafe(entry), data), {
			timestamp: at,
		}),
	);
}

/**
 * Adopt a request started elsewhere (the server's, during hydration),
 * unless the entry has data or a request of its own.
 */
export function resumeUnsafe(entry: Entry, promise: PromiseLike<unknown>) {
	if (Option.isSome(getDataUnsafe(entry)) || isFetchingUnsafe(entry)) {
		return;
	}
	entry.resumed = promise;
	refreshUnsafe(entry);
}
