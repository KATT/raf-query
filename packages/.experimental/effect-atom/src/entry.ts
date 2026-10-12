import type { QueryBehavior } from "@raf-query/core";
import { type Context, Duration, Effect, Option } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import type { QueryOptions } from "./options.ts";
import { request } from "./request.ts";
import type { Thenable } from "./thenable.ts";

/**
 * A plain (not paged) query's options, with data, error and services
 * erased. The services come from the entry's `services` context.
 */
export type PlainOptions = QueryOptions<unknown, unknown, never>;

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
	 * The query's `AsyncResult`: its request's, or what `setData` wrote.
	 * Idles out of the registry `gcTime` after its last reader leaves.
	 */
	readonly data: Atom.Writable<Result, unknown>;
	readonly hash: string;
	/**
	 * Set by `invalidate` when nothing reads the entry. Refreshing an atom
	 * nobody reads would interrupt its request and leave a node that refetches
	 * on any read, so the next `prefetch` / `ensure` refetches instead.
	 */
	invalidated: boolean;
	/** The latest factory call's options; the request reads them when it runs. */
	options: PlainOptions;
	readonly promises: Promises;
	/** `data`, refetched on window focus and reconnect while read and stale. */
	readonly read: Atom.Atom<Result>;
	/** {@link refetch} as a Promise function with a stable identity. */
	readonly refetch: () => Promise<void>;
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

/**
 * An entry for a query hash. `gcTime`, `staleTime` and the revalidation
 * settings are read once here, since they shape the atoms; the request
 * reads the latest options each time it runs.
 */
export function make(store: Store, hash: string, options: PlainOptions): Entry {
	const settings = behaviorOf(store.defaults, options);
	const gcTime = settings.gcTime ?? (store.isServer ? Infinity : 300_000);
	const fetcher = Atom.make(
		Effect.suspend(() =>
			request({
				behavior: behavior(entry),
				hash,
				isServer: store.isServer,
				options: entry.options,
				services: entry.services,
			}),
		),
	);
	const data = Atom.writable<Result, unknown>(fetcher.read, (ctx, value) => {
		ctx.setSelf(AsyncResult.success(value));
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
		data,
		hash,
		invalidated: false,
		options,
		promises: {},
		read,
		refetch: () => Effect.runPromise(refetch(entry)),
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

/** Refresh the data atom and read it, so the request starts even unread. */
function refreshUnsafe(entry: Entry): Result {
	const registry = entry.store.registry;
	entry.invalidated = false;
	registry.refresh(entry.data);
	return registry.get(entry.data);
}

/**
 * Start the query unless its data is fresh or a request is in flight.
 * Server clients only fetch what's missing. Returns the current result.
 */
export function startUnsafe(entry: Entry): Result {
	// Reading an atom the registry doesn't hold yet builds it, which starts
	// its first request; that result is `waiting`, so it isn't stale.
	const current = entry.store.registry.get(entry.data);
	const missing = Option.isNone(AsyncResult.value(current));
	if (isStaleUnsafe(entry, current) && (missing || !entry.store.isServer)) {
		return refreshUnsafe(entry);
	}
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
export function load(entry: Entry): Effect.Effect<unknown, unknown> {
	return Effect.suspend(() => {
		const value = AsyncResult.value(startUnsafe(entry));
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
	const node = entry.store.registry.getNodes().get(entry.data);
	if (node === undefined || node.currentState() !== "valid") {
		return Option.none();
	}
	return AsyncResult.value(node.value());
}

/** Write data. Readers re-render with it without suspending. */
export function setDataUnsafe(entry: Entry, data: unknown): void {
	entry.invalidated = false;
	entry.store.registry.set(entry.data, data);
}
