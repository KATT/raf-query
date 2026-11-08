import type { QueryClient } from "./client.ts";
import {
	type Entry,
	entryOf,
	fetchEntry,
	isInvalidated,
	isStale,
	type Outcome,
} from "./entry.ts";
import { hashKey } from "./keys/keys.ts";
import {
	type DataOf,
	type InputArgs,
	type InputOf,
	type KeyOf,
	optionsOf,
	type QueryFactory,
} from "./options.ts";

/** Bundlers replace `process.env.NODE_ENV`; typed here so consumers need no Node types. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * A small serializable reference to a query: its key and its factory's
 * input. It carries no data; readers get that from the cache. Handles of
 * different factories have different types.
 */
export interface QueryHandle<TFactory extends QueryFactory = QueryFactory> {
	readonly input: InputOf<TFactory>;
	readonly queryKey: KeyOf<TFactory>;
}

type LoadKind = "prefetch" | "revalidate" | "swr";

/** A query for `load` to start. Building one starts nothing. */
export interface LoadEntry<
	TFactory extends QueryFactory = QueryFactory,
	TKind extends LoadKind = LoadKind,
> {
	readonly factory: TFactory;
	readonly input: InputOf<TFactory>;
	readonly kind: TKind;
	/** For paged factories: how many pages a first load fetches. */
	readonly pages?: number;
}

export interface LoadEntryOptions {
	/** For paged factories: how many pages a first load fetches. Default 1. */
	readonly pages?: number;
}

type LoadEntryArgs<TFactory extends QueryFactory> =
	| [input: InputOf<TFactory>, options?: LoadEntryOptions]
	| InputArgs<TFactory>;

function loadEntry<TFactory extends QueryFactory, TKind extends LoadKind>(
	kind: TKind,
	factory: TFactory,
	args: ReadonlyArray<unknown>,
): LoadEntry<TFactory, TKind> {
	// SAFETY: the overloads below type `args` from the factory.
	const input = args[0] as InputOf<TFactory>;
	// SAFETY: as above; the second argument is always `LoadEntryOptions`.
	const options = args[1] as LoadEntryOptions | undefined;
	return { factory, input, kind, pages: options?.pages };
}

/**
 * Start the query if the cache has no fresh data, and don't wait for it.
 * It never makes the load reject: errors show up where a component reads
 * the handle.
 */
export function prefetch<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: LoadEntryArgs<TFactory>
): LoadEntry<TFactory, "prefetch"> {
	return loadEntry("prefetch", factory, args);
}

/**
 * Use cached data even when it's stale, and wait only when the cache has
 * none. Stale data resolves at once and refetches in the background, as
 * HTTP's
 * [`stale-while-revalidate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#stale-while-revalidate)
 * does. The load rejects if the fetch it waits for fails.
 */
export function swr<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: LoadEntryArgs<TFactory>
): LoadEntry<TFactory, "swr"> {
	return loadEntry("swr", factory, args);
}

/**
 * Wait for fresh data, as HTTP's
 * [`must-revalidate`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#must-revalidate)
 * does. Fresh cached data resolves at once without a refetch (`staleTime`
 * is the max-age); with stale data or none it waits for the fetch. On a
 * server client, data counts as fresh until a write invalidates it. The
 * load rejects if the fetch fails.
 */
export function revalidate<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: LoadEntryArgs<TFactory>
): LoadEntry<TFactory, "revalidate"> {
	return loadEntry("revalidate", factory, args);
}

/**
 * In place of a `load` entry: skip the query. Its handle is `undefined` and
 * `data` has no key for it, so a component renders its reader only when
 * there's a handle.
 *
 * ```ts
 * const [handles] = await load(queryClient, {
 *   drafts: user.isAdmin ? prefetch(draftsQuery, { slug }) : skipToken,
 * });
 * ```
 */
export const skipToken: unique symbol = Symbol("skipToken");

/** What `load` takes per name: an entry, or `skipToken`. */
type LoadEntries = Record<string, LoadEntry | typeof skipToken>;

type HandleOf<TEntry> = TEntry extends LoadEntry
	? QueryHandle<TEntry["factory"]>
	: undefined;

type DataOfEntry<TEntry> = TEntry extends LoadEntry
	? DataOf<TEntry["factory"]>
	: never;

type LoadedData<TEntries extends LoadEntries> = {
	[
		TName in keyof TEntries as TEntries[TName] extends LoadEntry<
			QueryFactory,
			"revalidate" | "swr"
		>
			? TName
			: never
	]: DataOfEntry<TEntries[TName]>;
};

/**
 * What `load` resolves to: a handle per entry (`undefined` for `skipToken`),
 * and the data of `swr` and `revalidate` entries.
 */
export type Loaded<TEntries extends LoadEntries> = readonly [
	handles: { [TName in keyof TEntries]: HandleOf<TEntries[TName]> },
	data: LoadedData<TEntries>,
];

/** A `load` call as devtools show it. */
export interface LoadRecord {
	readonly entries: ReadonlyArray<{
		readonly hash: string;
		readonly kind: LoadKind;
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

/** Start the entry's request if its data isn't fresh. Never waits. */
export function startIfStale(entry: Entry): void {
	if (isStale(entry) && !(entry.client.isServer && entry.state.hasData)) {
		void fetchEntry(entry);
	}
}

/**
 * Whether `revalidate` can use the entry's data. A server client belongs to
 * one request, so what it fetched is fresh for that request until a write
 * invalidates it.
 */
function isFresh(entry: Entry): boolean {
	return entry.client.isServer
		? entry.state.hasData && !isInvalidated(entry)
		: !isStale(entry);
}

function waitFresh(entry: Entry, pages: number | undefined): Promise<Outcome> {
	if (isFresh(entry)) {
		return Promise.resolve({ ok: true });
	}
	return fetchEntry(entry, { pages });
}

function waitAny(entry: Entry, pages: number | undefined): Promise<Outcome> {
	if (!entry.state.hasData) {
		return waitFresh(entry, pages);
	}
	startIfStale(entry);
	return Promise.resolve({ ok: true });
}

/**
 * Start a loader's queries and return a serializable handle for each. It
 * starts every entry before it waits for any, so the order of the entries
 * can't create a waterfall. Resolves with `[handles, data]` once every
 * `swr` and `revalidate` entry has data, and rejects with the error as soon
 * as one fails.
 * `prefetch` entries never make it reject. A `skipToken` in place of an
 * entry starts nothing and gets no handle.
 *
 * ```ts
 * const [handles, data] = await load(queryClient, {
 *   comments: prefetch(commentsQuery, { issueId: id }),
 *   issue: swr(issueQuery, { id }),
 * });
 * ```
 */
export async function load<const TEntries extends LoadEntries>(
	client: QueryClient,
	entries: TEntries,
): Promise<Loaded<TEntries>> {
	const loading = Object.entries(entries).flatMap(([name, item]) =>
		item === skipToken ? [] : [{ item, name }],
	);
	const started = loading.map((loaded) => {
		const item = loaded.item;
		const cached = entryOf(client, item.factory, item.input);
		let wait: Promise<Outcome> | undefined;
		if (item.kind === "prefetch") {
			startIfStale(cached);
		} else {
			wait = (item.kind === "revalidate" ? waitFresh : waitAny)(
				cached,
				item.pages,
			);
		}
		return { entry: cached, item, name: loaded.name, wait };
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
		handles[one.name] = { input: one.item.input, queryKey: one.entry.key };
		if (one.wait) {
			data[one.name] = readData(one.entry);
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
	const handle = {
		input,
		queryKey,
	} as QueryHandle<TFactory>;
	waterfallHandles.add(handle);
	return handle;
}

/**
 * The handle of a query whose input is only known while rendering, like an
 * id in another query's data. It starts nothing: the component that reads
 * it fetches when it renders, which makes it a request waterfall, and the
 * name keeps that visible. Prefer starting queries in a loader with `load`.
 *
 * With a handle and an updater, it derives a handle from that one: the
 * updater gets the handle's input and returns the new one (say, with a
 * search term being typed). While the new input maps to the same query, it
 * returns the handle as is, so readers keep it.
 *
 * ```ts
 * const searchHandle = waterfallHandle(searchQuery, props.search, (input) => ({ ...input, q }));
 * ```
 */
export function waterfallHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	...input: InputArgs<TFactory>
): QueryHandle<TFactory>;
export function waterfallHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	handle: QueryHandle<TFactory>,
	update: (input: InputOf<TFactory>) => InputOf<TFactory>,
): QueryHandle<TFactory>;
export function waterfallHandle<TFactory extends QueryFactory>(
	factory: TFactory,
	...args: ReadonlyArray<unknown>
): QueryHandle<TFactory> {
	if (args.length < 2) {
		return toHandle(factory, args[0]);
	}
	// SAFETY: the two-argument overload passes a handle, then an updater of its input.
	const [handle, update] = args as [
		QueryHandle<TFactory>,
		(input: unknown) => unknown,
	];
	const next = toHandle(factory, update(handle.input));
	return hashKey(next.queryKey) === hashKey(handle.queryKey) ? handle : next;
}
