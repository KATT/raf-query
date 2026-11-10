import type { Operation, QueryClient } from "./client.ts";
import { isObject } from "./guards.ts";
import { type AnyFactory, hashKey, type QueryKey } from "./keys/keys.ts";
import { matches, type Stamp } from "./keys/targets.ts";
import { optionsOf, type QueryOptions, type StreamOptions } from "./options.ts";
import { replaceEqualDeep } from "./structural-sharing/structural-sharing.ts";
import {
	listeners,
	type Listeners,
	type SubscribeOptions,
} from "./subscribe.ts";
import { fulfilled, pending, type Pending, type Thenable } from "./thenable.ts";

/** An entry's state. A new object on every change, so it works as a snapshot. */
export interface EntryState {
	readonly data: unknown;
	/** The last request's error, while it's the latest outcome. */
	readonly error: unknown;
	readonly fetchingDirection: "next" | "previous" | undefined;
	readonly hasData: boolean;
	readonly isFetching: boolean;
	readonly status: "error" | "pending" | "success";
	/** When the data was written (ms since epoch); `0` without data. */
	readonly updatedAt: number;
}

/** How a request ended, for whoever waited on it. */
export type Outcome =
	| { readonly error: unknown; readonly ok: false }
	| { readonly ok: true };

interface Run {
	readonly controller: AbortController;
	readonly done: PromiseWithResolvers<Outcome>;
	/** Resolve `done` at the first chunk of a stream, not its end. */
	settled: boolean;
	readonly startedAt: number;
}

export interface Entry {
	readonly client: QueryClient;
	factory: AnyFactory | undefined;
	gcTimer: unknown;
	readonly hash: string;
	input: unknown;
	readonly key: QueryKey;
	options: QueryOptions | undefined;
	pendingThenable: Pending<unknown> | undefined;
	readonly readers: Listeners<EntryState>;
	/** `~seq` when the request behind the data started; invalidations after it make it stale. */
	requestedAt: number;
	run: Run | undefined;
	state: EntryState;
	thenable: Thenable<unknown>;
}

const initialState: EntryState = {
	data: undefined,
	error: undefined,
	fetchingDirection: undefined,
	hasData: false,
	isFetching: false,
	status: "pending",
	updatedAt: 0,
};

const fiveMinutes = 5 * 60 * 1000;

/**
 * Make the `AbortError` (a `DOMException`) that a `load` waiting on a removed query rejects with.
 *
 * @see https://raf-query.katt.dev/docs/query-cancellation#when-requests-are-aborted
 */
export function abortError(): DOMException {
	return new DOMException("The query was cancelled", "AbortError");
}

function notify(entry: Entry) {
	const client = entry.client;
	const changed = client["~changed"];
	if (changed.size === 0) {
		queueMicrotask(() => {
			const batch = [...changed];
			changed.clear();
			for (const item of batch) {
				item.readers.emit(item.state);
				client["~events"].emit({ entry: item, type: "updated" });
			}
		});
	}
	changed.add(entry);
}

function setState(entry: Entry, patch: Partial<EntryState>) {
	entry.state = { ...entry.state, ...patch };
	notify(entry);
}

function newPending(entry: Entry) {
	const next = pending<unknown>();
	entry.pendingThenable = next;
	entry.thenable = next.promise;
}

function gcTime(entry: Entry): number {
	return entry.options?.gcTime ?? entry.client.config.gcTime ?? fiveMinutes;
}

function scheduleGc(entry: Entry) {
	const client = entry.client;
	client.clock.clearTimeout(entry.gcTimer);
	entry.gcTimer = undefined;
	const time = gcTime(entry);
	if (client.isServer || entry.readers.size > 0 || !Number.isFinite(time)) {
		return;
	}
	entry.gcTimer = client.clock.setTimeout(() => {
		entry.gcTimer = undefined;
		if (entry.run) {
			void entry.run.done.promise.then(() => scheduleGc(entry));
			return;
		}
		remove(entry);
	}, time);
}

function create(client: QueryClient, key: QueryKey, hash: string): Entry {
	const first = pending<unknown>();
	const entry: Entry = {
		client,
		factory: undefined,
		gcTimer: undefined,
		hash,
		input: undefined,
		key,
		options: undefined,
		pendingThenable: first,
		readers: listeners<EntryState>((size) => {
			client["~events"].emit({ entry, type: "readers" });
			if (size === 0) {
				scheduleGc(entry);
			} else {
				client.clock.clearTimeout(entry.gcTimer);
				entry.gcTimer = undefined;
			}
		}),
		requestedAt: client["~seq"],
		run: undefined,
		state: initialState,
		thenable: first.promise,
	};
	client["~entries"].set(hash, entry);
	client["~events"].emit({ entry, type: "added" });
	scheduleGc(entry);
	return entry;
}

/** The entry for a key, created if missing. Hydration uses it. */
export function entryForKey(client: QueryClient, key: QueryKey): Entry {
	const hash = hashKey(key);
	return client["~entries"].get(hash) ?? create(client, key, hash);
}

/**
 * The entry for a factory's input, created if missing, with the factory's
 * current options. Every read goes through here, which links an entry that
 * was only hydrated to its factory.
 */
export function entryOf(
	client: QueryClient,
	factory: AnyFactory,
	input: unknown,
): Entry {
	const options = optionsOf(factory, input);
	const entry = entryForKey(client, options.queryKey);
	entry.factory = factory;
	entry.input = input;
	entry.options = options;
	scheduleGc(entry);
	return entry;
}

/** Whether an invalidation newer than the entry's data covers it. */
export function isInvalidated(entry: Entry): boolean {
	return entry.client["~stamps"].some(
		(stamp) => stamp.at > entry.requestedAt && matches(entry, stamp),
	);
}

/** Whether the entry's data should be refetched before it's trusted. */
export function isStale(entry: Entry): boolean {
	const state = entry.state;
	if (!state.hasData) {
		return true;
	}
	const staleTime =
		entry.options?.staleTime ?? entry.client.config.staleTime ?? 0;
	return (
		entry.client.clock.now() - state.updatedAt >= staleTime ||
		isInvalidated(entry)
	);
}

/** Write data. `startedAt` orders it against invalidations. */
export function write(
	entry: Entry,
	data: unknown,
	updatedAt: number,
	startedAt: number,
): void {
	const previous = entry.state;
	const sharing =
		entry.options?.structuralSharing ??
		entry.client.config.structuralSharing ??
		true;
	const next =
		sharing && previous.hasData ? replaceEqualDeep(previous.data, data) : data;
	entry.requestedAt = Math.max(entry.requestedAt, startedAt);
	if (entry.pendingThenable) {
		entry.pendingThenable.resolve(next);
		entry.pendingThenable = undefined;
	} else if (!previous.hasData || next !== previous.data) {
		entry.thenable = fulfilled(next);
	}
	setState(entry, {
		data: next,
		error: undefined,
		hasData: true,
		status: "success",
		updatedAt,
	});
	scheduleGc(entry);
}

/**
 * Record a failed request. Data the entry had stays readable. Without data,
 * the request in flight has a pending thenable for readers: it rejects.
 */
function failWith(entry: Entry, error: unknown): void {
	if (!entry.state.hasData) {
		entry.pendingThenable?.reject(error);
		entry.pendingThenable = undefined;
	}
	setState(entry, { error, status: "error" });
}

function finish(entry: Entry, run: Run, outcome: Outcome) {
	entry.run = undefined;
	setState(entry, { fetchingDirection: undefined, isFetching: false });
	run.done.resolve(outcome);
	scheduleGc(entry);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return isObject(value) && Symbol.asyncIterator in value;
}

async function pump(
	entry: Entry,
	run: Run,
	chunks: AsyncIterable<unknown>,
	stream: StreamOptions<unknown, never>,
) {
	let data = stream.initial;
	try {
		for await (const chunk of chunks) {
			if (entry.run !== run) {
				return;
			}
			data = stream.reduce(
				data,
				// SAFETY: `reduce` takes the chunks this `queryFn` yields.
				chunk as never,
			);
			write(entry, data, entry.client.clock.now(), run.startedAt);
			if (!run.settled) {
				run.settled = true;
				run.done.resolve({ ok: true });
			}
		}
	} catch (error) {
		if (entry.run === run) {
			failWith(entry, error);
			finish(entry, run, { error, ok: false });
		}
		return;
	}
	if (entry.run === run) {
		if (!run.settled) {
			write(entry, data, entry.client.clock.now(), run.startedAt);
		}
		finish(entry, run, { ok: true });
	}
}

function terminal(op: Operation): Promise<unknown> {
	return new Promise((resolve) => {
		const options = op.options;
		const paged = options["~run"];
		resolve(
			paged
				? paged(
						// SAFETY: `infiniteQueryOptions` takes operations.
						op as never,
					)
				: options.queryFn(
						// SAFETY: the factory's own context type.
						{
							meta: op.meta,
							queryKey: op.queryKey,
							signal: op.signal,
						} as never,
					),
		);
	});
}

function chain(op: Operation): Promise<unknown> {
	const links = op.client.config.links ?? [];
	const call = (index: number, current: Operation): Promise<unknown> => {
		const link = links[index];
		return link
			? link(current, (next) => call(index + 1, next))
			: terminal(current);
	};
	return call(0, op);
}

export interface FetchRequest {
	readonly direction?: "next" | "previous";
	readonly pages?: number;
	/** Abort a request in flight and start over (an invalidation). */
	readonly restart?: boolean;
}

/**
 * Run the entry's request, or join the one in flight. Resolves with how it
 * ended, never rejects: a removed entry's request ends with an `AbortError`.
 * Whoever waited on a restarted request gets the new one's outcome.
 */
export function fetchEntry(
	entry: Entry,
	request: FetchRequest = {},
): Promise<Outcome> {
	const current = entry.run;
	if (current && !request.restart && request.direction === undefined) {
		return current.done.promise;
	}
	const options = entry.options;
	if (!options) {
		// A hydrated entry no factory call has given options yet.
		return Promise.resolve({ ok: true });
	}
	current?.controller.abort();
	const client = entry.client;
	const run: Run = {
		controller: new AbortController(),
		done:
			current && !current.settled
				? current.done
				: Promise.withResolvers<Outcome>(),
		settled: false,
		startedAt: ++client["~seq"],
	};
	entry.run = run;
	if (!entry.state.hasData && !entry.pendingThenable) {
		newPending(entry);
	}
	setState(entry, {
		fetchingDirection: request.direction,
		isFetching: true,
	});
	const state = entry.state;
	chain({
		client,
		data: state.data,
		direction: request.direction,
		hasData: state.hasData,
		hash: entry.hash,
		input: entry.input,
		meta: options.meta ?? {},
		options,
		pages: request.pages,
		queryKey: entry.key,
		signal: run.controller.signal,
	}).then(
		(result) => {
			if (entry.run !== run) {
				return;
			}
			if (options.stream && isAsyncIterable(result)) {
				void pump(entry, run, result, options.stream);
				return;
			}
			if (!options["~run"] && entry.requestedAt > run.startedAt) {
				// A `setData` landed while this request ran. The cache can't tell
				// which is newer, but a live writer sends every later change
				// again while a dropped write never comes back, so the write wins.
				// Paged requests merge with such writes page by page instead.
				finish(entry, run, { ok: true });
				return;
			}
			write(entry, result, client.clock.now(), run.startedAt);
			finish(entry, run, { ok: true });
		},
		(error: unknown) => {
			if (entry.run !== run) {
				return;
			}
			failWith(entry, error);
			finish(entry, run, { error, ok: false });
		},
	);
	return run.done.promise;
}

/** Take over a request started elsewhere (hydration of a pending entry). */
export function adopt(
	entry: Entry,
	promise: PromiseLike<{ readonly data?: unknown; readonly updatedAt: number }>,
): void {
	const run: Run = {
		controller: new AbortController(),
		done: Promise.withResolvers<Outcome>(),
		settled: false,
		startedAt: entry.client["~seq"],
	};
	entry.run = run;
	if (!entry.state.hasData && !entry.pendingThenable) {
		newPending(entry);
	}
	setState(entry, { isFetching: true });
	Promise.resolve(promise).then(
		(sent) => {
			if (entry.run === run) {
				write(entry, sent.data, sent.updatedAt, run.startedAt);
				finish(entry, run, { ok: true });
			}
		},
		(error: unknown) => {
			if (entry.run === run) {
				failWith(entry, error);
				finish(entry, run, { error, ok: false });
			}
		},
	);
}

/** Subscribe to an entry's state. Subscribers are its readers: an entry with none can be gc'd. */
export function subscribeEntry(
	entry: Entry,
	listener: (state: EntryState) => void,
	options?: SubscribeOptions,
): () => void {
	return entry.readers.subscribe(listener, options);
}

/** Drop the entry, aborting its request. Waiters get an `AbortError`. */
export function remove(entry: Entry): void {
	const client = entry.client;
	if (client["~entries"].get(entry.hash) !== entry) {
		return;
	}
	client["~entries"].delete(entry.hash);
	client.clock.clearTimeout(entry.gcTimer);
	const run = entry.run;
	entry.run = undefined;
	if (run) {
		run.controller.abort();
		run.done.resolve({ error: abortError(), ok: false });
	}
	client["~events"].emit({ entry, type: "removed" });
}

/** Drop data and errors. Read entries (or ones loading) refetch; resolves when they settle. */
export function reset(entry: Entry): Promise<Outcome> {
	entry.state = initialState;
	newPending(entry);
	notify(entry);
	if (entry.readers.size > 0 || entry.run) {
		return fetchEntry(entry, { restart: true });
	}
	return Promise.resolve({ ok: true });
}

/**
 * Record an invalidation: one stamp per target, all at one point in the
 * sequence. Entries they cover that have readers refetch now, once however
 * many stamps cover them; the rest find out when they are next read.
 * Resolves when the refetches settle.
 */
export function invalidate(
	client: QueryClient,
	makeStamps: (at: number) => ReadonlyArray<Stamp>,
): Promise<void> {
	const stamps = makeStamps(++client["~seq"]);
	const entries = [...client["~entries"].values()];
	const oldest = Math.min(...entries.map((entry) => entry.requestedAt));
	client["~stamps"] = [
		...client["~stamps"].filter((kept) => kept.at > oldest),
		...stamps,
	];
	const refetches: Array<Promise<Outcome>> = [];
	for (const entry of entries) {
		if (stamps.some((stamp) => matches(entry, stamp))) {
			notify(entry);
			if (entry.readers.size > 0) {
				refetches.push(fetchEntry(entry, { restart: true }));
			}
		}
	}
	return Promise.all(refetches).then(() => {});
}
