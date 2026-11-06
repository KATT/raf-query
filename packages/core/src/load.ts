import type { QueryClient } from "./client.ts";
import {
	type Entry,
	entryOf,
	fetchEntry as request,
	isEnabled,
	isStale,
	type Outcome,
	QueryDisabledError,
} from "./entry.ts";
import { hashKey } from "./keys.ts";
import {
	type DataOf,
	type InputArgs,
	type InputOf,
	type KeyOf,
	optionsOf,
	type QueryFactory,
} from "./options.ts";

/**
 * A small serializable reference to a query: its key and its factory's
 * input. It carries no data; readers get that from the cache. Handles of
 * different factories have different types.
 */
export interface QueryHandle<TFactory extends QueryFactory = QueryFactory> {
	readonly input: InputOf<TFactory>;
	readonly queryKey: KeyOf<TFactory>;
}

/**
 * A handle from a fetch or ensure entry: when its `load` resolved, the cache
 * had the query's data. `useQuery` returns the data itself for it.
 */
export interface DefinedQueryHandle<
	TFactory extends QueryFactory = QueryFactory,
> extends QueryHandle<TFactory> {
	readonly defined: true;
}

type EntryKind = "ensure" | "fetch" | "prefetch";

/** A query for `load` to start. Building one starts nothing. */
export interface LoadEntry<
	TFactory extends QueryFactory = QueryFactory,
	TKind extends EntryKind = EntryKind,
> {
	readonly factory: TFactory;
	readonly input: InputOf<TFactory>;
	readonly kind: TKind;
	/** For paged factories: how many pages a first load fetches. */
	readonly pages?: number;
}

export interface EntryOptions {
	/** For paged factories: how many pages a first load fetches. Default 1. */
	readonly pages?: number;
}

type EntryArgs<TFactory extends QueryFactory> =
	| [input: InputOf<TFactory>, options?: EntryOptions]
	| InputArgs<TFactory>;

function makeEntry<TFactory extends QueryFactory, TKind extends EntryKind>(
	kind: TKind,
	factory: TFactory,
	args: ReadonlyArray<unknown>,
): LoadEntry<TFactory, TKind> {
	// SAFETY: the overloads below type `args` from the factory.
	const input = args[0] as InputOf<TFactory>;
	// SAFETY: as above; the second argument is always `EntryOptions`.
	const options = args[1] as EntryOptions | undefined;
	return { factory, input, kind, pages: options?.pages };
}

/**
 * An entry that starts the query without waiting for it. It fetches only if
 * the cache has no fresh data, and never makes the load reject: errors show
 * up where a component reads the handle.
 */
export function prefetchEntry<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: EntryArgs<TFactory>
): LoadEntry<TFactory, "prefetch"> {
	return makeEntry("prefetch", factory, args);
}

/**
 * An entry that waits for fresh data: cached data only counts if it isn't
 * stale. The load rejects if the fetch fails.
 */
export function fetchEntry<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: EntryArgs<TFactory>
): LoadEntry<TFactory, "fetch"> {
	return makeEntry("fetch", factory, args);
}

/**
 * An entry that waits only when the cache has no data. Stale data resolves
 * at once and revalidates in the background. The load rejects if the fetch
 * it waits for fails.
 */
export function ensureEntry<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: EntryArgs<TFactory>
): LoadEntry<TFactory, "ensure"> {
	return makeEntry("ensure", factory, args);
}

type HandleOf<TEntry> =
	TEntry extends LoadEntry<infer TFactory, infer TKind>
		? TKind extends "prefetch"
			? QueryHandle<TFactory>
			: DefinedQueryHandle<TFactory>
		: never;

type LoadedData<TEntries extends Record<string, LoadEntry>> = {
	[
		TName in keyof TEntries as TEntries[TName] extends LoadEntry<
			QueryFactory,
			"ensure" | "fetch"
		>
			? TName
			: never
	]: DataOf<TEntries[TName]["factory"]>;
};

/** What `load` resolves to: a handle per entry, and the data of fetch and ensure entries. */
export type Loaded<TEntries extends Record<string, LoadEntry>> = readonly [
	handles: { [TName in keyof TEntries]: HandleOf<TEntries[TName]> },
	data: LoadedData<TEntries>,
];

/** A `load` call as devtools show it. */
export interface LoadRecord {
	readonly entries: ReadonlyArray<{
		readonly hash: string;
		readonly kind: EntryKind;
		readonly name: string;
	}>;
	readonly startedAt: number;
}

const loadRecords = new WeakMap<QueryClient, Array<LoadRecord>>();

/** The latest `load` calls on a client, newest last. Recorded in development only. */
export function loadsOf(client: QueryClient): ReadonlyArray<LoadRecord> {
	return loadRecords.get(client) ?? [];
}

/** Read an entry's data the way its readers see it: through `select`. */
export function readData(entry: Entry): unknown {
	const select = entry.options?.select;
	return select
		? select(
				/* SAFETY: the entry holds this query's data. */ entry.state
					.data as never,
			)
		: entry.state.data;
}

function disabled(entry: Entry): Promise<Outcome> {
	return Promise.resolve({
		error: new QueryDisabledError(`Query ${entry.hash} is disabled`),
		ok: false,
	});
}

/** Start the entry's request if its data isn't fresh. Never waits. */
export function prefetch(entry: Entry): void {
	if (
		isEnabled(entry) &&
		isStale(entry) &&
		!(entry.client.isServer && entry.state.hasData)
	) {
		void request(entry);
	}
}

function waitFresh(entry: Entry, pages: number | undefined): Promise<Outcome> {
	if (!isEnabled(entry)) {
		return disabled(entry);
	}
	if (!isStale(entry)) {
		return Promise.resolve({ ok: true });
	}
	return request(entry, { pages });
}

function waitAny(entry: Entry, pages: number | undefined): Promise<Outcome> {
	if (!entry.state.hasData) {
		return waitFresh(entry, pages);
	}
	prefetch(entry);
	return Promise.resolve({ ok: true });
}

/**
 * Start a loader's queries and return a serializable handle for each. It
 * starts every entry before it waits for any, so the order of the entries
 * can't create a waterfall. Resolves with `[handles, data]` once every fetch
 * and ensure entry has data, and rejects as soon as one fails: with a
 * `QueryFailure` for a `fail()`, the error itself otherwise. Prefetch
 * entries never make it reject.
 *
 * ```ts
 * const [handles, data] = await load(queryClient, {
 *   comments: prefetchEntry(commentsQuery, { issueId: id }),
 *   issue: ensureEntry(issueQuery, { id }),
 * });
 * ```
 */
export async function load<const TEntries extends Record<string, LoadEntry>>(
	client: QueryClient,
	entries: TEntries,
): Promise<Loaded<TEntries>> {
	const started = Object.entries(entries).map(([name, item]) => {
		const cached = entryOf(client, item.factory, item.input);
		let wait: Promise<Outcome> | undefined;
		if (item.kind === "prefetch") {
			prefetch(cached);
		} else {
			wait = (item.kind === "fetch" ? waitFresh : waitAny)(cached, item.pages);
		}
		return { entry: cached, item, name, wait };
	});
	if (process.env.NODE_ENV !== "production") {
		const records = loadRecords.get(client) ?? [];
		records.push({
			entries: started.map((one) => ({
				hash: one.entry.hash,
				kind: one.item.kind,
				name: one.name,
			})),
			startedAt: client.clock.now(),
		});
		loadRecords.set(client, records.slice(-20));
	}
	const waits = started.map((one) =>
		one.wait?.then((outcome) => {
			if (!outcome.ok) {
				throw outcome.error;
			}
		}),
	);
	await Promise.all(waits);
	const handles: Record<string, unknown> = {};
	const data: Record<string, unknown> = {};
	for (const one of started) {
		const handle = { input: one.item.input, queryKey: one.entry.key };
		if (one.wait) {
			handles[one.name] = { ...handle, defined: true };
			data[one.name] = readData(one.entry);
		} else {
			handles[one.name] = handle;
		}
	}
	// SAFETY: built from the entries, as `Loaded` describes.
	return [handles, data] as unknown as Loaded<TEntries>;
}

const waterfallHandles = new WeakSet<object>();

/** Whether a handle came from `waterfallHandle()`: reading it is expected to fetch. */
export function isWaterfallHandle(
	handle: Pick<QueryHandle, "queryKey">,
): boolean {
	return waterfallHandles.has(handle);
}

function toHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	input: unknown,
): QueryHandle<TFactory> {
	const queryKey = optionsOf(factory, input).queryKey;
	// SAFETY: the key comes from this factory.
	const handle = { input, queryKey } as QueryHandle<TFactory>;
	waterfallHandles.add(handle);
	return handle;
}

/**
 * The handle of a query whose input is only known while rendering, like an
 * id in another query's data. It starts nothing: the component that reads
 * it fetches when it renders, which makes it a request waterfall, and the
 * name keeps that visible. Prefer starting queries in a loader with `load`.
 *
 * With a handle and a new input (say, a search term being typed), it
 * switches the handle to that input, and returns the handle as is while
 * the new input maps to the same query.
 */
export function waterfallHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	...input: InputArgs<TFactory>
): QueryHandle<TFactory>;
export function waterfallHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	input: InputOf<TFactory>,
): QueryHandle<TFactory>;
export function waterfallHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: ReadonlyArray<unknown>
): QueryHandle<TFactory> {
	if (args.length < 2) {
		return toHandle(factory, args[0]);
	}
	// SAFETY: the two-argument overload passes a handle first.
	const handle = args[0] as QueryHandle<TFactory>;
	const next = toHandle(factory, args[1]);
	return hashKey(next.queryKey) === hashKey(handle.queryKey) ? handle : next;
}
