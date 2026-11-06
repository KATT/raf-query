/**
 * Moving cache entries from a server to a browser. Opt-in: nothing in the
 * client, the kernel or `useQuery` imports this module, so apps that don't
 * server-render don't bundle it.
 */
import type { QueryClient } from "./client.ts";
import {
	adopt,
	type Entry,
	entryForKey,
	failWith,
	fetchEntry,
	isEnabled,
	isStale,
	write,
} from "./entry.ts";
import { type Fail, failOf, isFailValue } from "./fail.ts";
import type { QueryKey } from "./keys.ts";

/** What a dehydrated pending entry's promise resolves to. */
export interface DehydratedResult {
	readonly data?: unknown;
	/** Set when the request returned `fail()`. */
	readonly fail?: Fail;
	/** When the sender got the result (ms since epoch). */
	readonly updatedAt: number;
}

/**
 * One cache entry in transit. Settled entries carry `data` (or `fail`) and
 * `updatedAt > 0`; entries still loading carry their request's `promise`,
 * so the receiver resumes it instead of fetching again.
 */
export interface DehydratedEntry {
	readonly data?: unknown;
	readonly fail?: Fail;
	readonly promise?: Promise<DehydratedResult>;
	readonly queryKey: QueryKey;
	readonly tags?: ReadonlyArray<string>;
	/** When the data was fetched; `0` while pending. */
	readonly updatedAt: number;
}

export interface DehydratedState {
	readonly entries: ReadonlyArray<DehydratedEntry>;
}

export interface DehydrateOptions {
	/** Which entries to send. Default: entries with data, a `fail()`, or a request in flight. */
	readonly filter?: (entry: Entry) => boolean;
	/** Send a pending entry's unexpected error as is, instead of a `RedactedError`. */
	readonly keepErrors?: boolean;
	/**
	 * Hashes already sent in this transfer (one request). Those entries are
	 * skipped, and the ones sent are added.
	 */
	readonly sent?: Set<string>;
}

/**
 * What a streamed pending entry rejects with when its server request threw:
 * the browser learns which query failed, not why. Expected errors (`fail()`)
 * cross as they are.
 */
export class RedactedError extends Error {
	override readonly name = "RedactedError";
	readonly hash: string;
	constructor(hash: string) {
		super(`Query ${hash} failed on the server`);
		this.hash = hash;
	}
}

/** The default filter: entries with data, a `fail()`, or a request in flight. */
export function canDehydrate(entry: Entry): boolean {
	const state = entry.state;
	return state.hasData || state.isFetching || isFailValue(state.error);
}

function dehydrateEntry(
	entry: Entry,
	options: DehydrateOptions,
): DehydratedEntry {
	const state = entry.state;
	const base = { queryKey: entry.key, tags: entry.tags };
	if (state.hasData) {
		return { ...base, data: state.data, updatedAt: state.updatedAt };
	}
	const run = entry.run;
	if (!run) {
		return {
			...base,
			fail: failOf(state.error),
			updatedAt: entry.client.clock.now(),
		};
	}
	const promise = run.done.promise.then((outcome): DehydratedResult => {
		if (outcome.ok) {
			return { data: entry.state.data, updatedAt: entry.state.updatedAt };
		}
		const failed = failOf(outcome.error);
		if (failed) {
			return { fail: failed, updatedAt: entry.client.clock.now() };
		}
		throw options.keepErrors ? outcome.error : new RedactedError(entry.hash);
	});
	promise.catch(() => {});
	return { ...base, promise, updatedAt: 0 };
}

function dehydrateEntries(
	entries: Iterable<Entry>,
	options: DehydrateOptions,
): DehydratedState {
	const filter = options.filter ?? canDehydrate;
	const sent = options.sent;
	const dehydrated: Array<DehydratedEntry> = [];
	for (const entry of entries) {
		if (!sent?.has(entry.hash) && isEnabled(entry) && filter(entry)) {
			sent?.add(entry.hash);
			dehydrated.push(dehydrateEntry(entry, options));
		}
	}
	return { entries: dehydrated };
}

/** Snapshot the client's entries for transfer. */
export function dehydrate(
	client: QueryClient,
	options: DehydrateOptions = {},
): DehydratedState {
	return dehydrateEntries(client["~entries"].values(), options);
}

export interface DehydratedStream {
	/** Stop: send what changed, then end `updates`. */
	close(): void;
	/** The entries to send first. */
	readonly initial: DehydratedState;
	/** Entries as they start or settle, batched per microtask. */
	readonly updates: ReadableStream<DehydratedState>;
}

/**
 * The cache now, then entries as they start, until `close()`. Snapshots and
 * subscribes in one synchronous step, so no change falls between the two.
 */
export function dehydrateStream(
	client: QueryClient,
	options: DehydrateOptions = {},
): DehydratedStream {
	const send = { ...options, sent: options.sent ?? new Set<string>() };
	const unsubscribe = new AbortController();
	let controller: ReadableStreamDefaultController<DehydratedState> | undefined;
	const updates = new ReadableStream<DehydratedState>({
		start(streamController) {
			controller = streamController;
		},
	});
	let batch: Set<Entry> | undefined;
	const flush = () => {
		const changed = batch;
		batch = undefined;
		if (!changed) {
			return;
		}
		const state = dehydrateEntries(changed, send);
		if (state.entries.length > 0) {
			controller?.enqueue(state);
		}
	};
	client.subscribe(
		(event) => {
			if (event.type === "removed" || send.sent.has(event.entry.hash)) {
				return;
			}
			if (!batch) {
				batch = new Set();
				queueMicrotask(flush);
			}
			batch.add(event.entry);
		},
		{ signal: unsubscribe.signal },
	);
	return {
		close() {
			if (unsubscribe.signal.aborted) {
				return;
			}
			flush();
			unsubscribe.abort();
			controller?.close();
		},
		initial: dehydrate(client, send),
		updates,
	};
}

function revalidate(entry: Entry) {
	if (entry.options && entry.readers.size > 0 && isStale(entry)) {
		void fetchEntry(entry);
	}
}

/** Take the sender's data if it's newer than the entry's. */
function takeNewer(entry: Entry, result: DehydratedResult) {
	if (result.fail) {
		if (!entry.state.hasData && !entry.run) {
			failWith(entry, result.fail);
		}
		return;
	}
	if (!entry.state.hasData || entry.state.updatedAt < result.updatedAt) {
		write(entry, result.data, result.updatedAt, entry.client["~seq"]);
	} else {
		revalidate(entry);
	}
}

/**
 * Write dehydrated entries into a client. Existing entries only take newer
 * data. A pending entry the client has nothing for resumes the sender's
 * request; one that has data or a request of its own waits for the
 * sender's, takes it if newer, and revalidates if the sender's failed.
 */
export function hydrate(client: QueryClient, state: DehydratedState): void {
	for (const sent of state.entries) {
		const entry = entryForKey(client, sent.queryKey);
		if (entry.tags.length === 0 && sent.tags) {
			entry.tags = sent.tags;
		}
		if (sent.promise === undefined) {
			takeNewer(entry, sent);
		} else {
			const result = Promise.resolve(sent.promise);
			if (!entry.state.hasData && !entry.run) {
				adopt(
					entry,
					result.then((settled) => {
						if (settled.fail) {
							throw settled.fail;
						}
						return { data: settled.data, updatedAt: settled.updatedAt };
					}),
				);
			} else {
				result.then(
					(settled) => takeNewer(entry, settled),
					() => revalidate(entry),
				);
			}
		}
	}
}
