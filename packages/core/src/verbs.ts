import type { QueryClient } from "./client.ts";
import {
	type Entry,
	entryOf,
	invalidate,
	type Outcome,
	remove,
	reset,
	write,
} from "./entry.ts";
import {
	type AnyFactory,
	type AnyInvalidation,
	entryStamp,
	type Group,
	hashKey,
	matches,
	type ParamArgs,
	type Stamp,
	stampFor,
	type Target,
} from "./keys.ts";
import { isFunction } from "./guards.ts";
import {
	type InputArgs,
	type KeyOf,
	optionsOf,
	type QueryFactory,
	type RootOfFactory,
} from "./options.ts";
import type { IsAnyRoot, RootTypes } from "./root.ts";
import type { InfiniteData } from "./infinite.ts";

type DeepPartial<T> = T extends object
	? { readonly [TName in keyof T]?: DeepPartial<T[TName]> }
	: T;

type Last<T> = T extends readonly [...Array<unknown>, infer TLast]
	? TLast
	: never;

/** What `invalidateMany(factory, partial)` takes: part of the key's last segment. */
export type PartialInput<TFactory extends QueryFactory> = DeepPartial<
	Last<KeyOf<TFactory>>
>;

/**
 * The clients a factory's verbs take: its root's, or any client for a
 * factory without `def`.
 */
export type ClientFor<TFactory extends QueryFactory> = QueryClient<
	RootOfFactory<TFactory>
>;

/**
 * A target a client's root can match: its `where` reads that root's `meta`.
 * A client typed only as `QueryClient` (from `useQueryClient()`, say) may
 * be of any root, so it takes any target.
 */
export type TargetFor<TTypes extends RootTypes, TParam> =
	IsAnyRoot<TTypes> extends true
		? Target<never, TParam>
		: Target<NoInfer<TTypes["meta"]>, TParam>;

/** The data `setData` writes: plain for a query, paged for an infinite one. */
type WritableData<TFactory extends QueryFactory> =
	ReturnType<TFactory> extends {
		readonly select?: (data: infer TData) => unknown;
	}
		? TData
		: InfiniteData<unknown>;

function hashOf(factory: AnyFactory, input: unknown): string {
	return hashKey(optionsOf(factory, input).queryKey);
}

function entriesMatching(
	client: QueryClient,
	stamp: Stamp,
): ReadonlyArray<Entry> {
	return [...client["~entries"].values()].filter((entry) =>
		matches(entry, stamp),
	);
}

function settle(outcomes: ReadonlyArray<Promise<Outcome>>): Promise<void> {
	return Promise.all(outcomes).then(() => {});
}

/**
 * Mark one query stale: a factory and its full input. If it's read, it
 * refetches; resolves when that settles.
 */
export function invalidateOne<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	return invalidate(client, (at) => entryStamp(hashOf(factory, input[0]), at));
}

/**
 * Mark queries stale: a factory's (optionally only those whose input
 * matches `partial`), a group's (keys that start with its path, whether
 * the group built them or not), or those a target's `where` picks, such as
 * a tag from `@raf-query/core/groups`. Read queries refetch now; the rest
 * when next read. Resolves when the refetches settle.
 */
export function invalidateMany<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	partial?: PartialInput<TFactory>,
): Promise<void>;
export function invalidateMany(
	client: QueryClient,
	group: Group,
): Promise<void>;
export function invalidateMany<TTypes extends RootTypes, TParam = never>(
	client: QueryClient<TTypes>,
	target: TargetFor<TTypes, TParam>,
	...param: ParamArgs<NoInfer<TParam>>
): Promise<void>;
export function invalidateMany(
	client: QueryClient,
	target: AnyInvalidation,
	partial?: unknown,
): Promise<void> {
	return invalidate(client, (at) => stampFor(target, partial, at));
}

/** Mark every query stale; read ones refetch. For sign-out, or after any write. */
export function invalidateAll(client: QueryClient): Promise<void> {
	return invalidate(client, (at) => ({ at, kind: "all" }));
}

function oneEntry(
	client: QueryClient,
	factory: AnyFactory,
	input: unknown,
): Entry | undefined {
	return client["~entries"].get(hashOf(factory, input));
}

/**
 * Drop one query's data and error. If it's read, it suspends and refetches;
 * resolves when that settles.
 */
export function resetOne<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	const entry = oneEntry(client, factory, input[0]);
	return settle(entry ? [reset(entry)] : []);
}

/** {@link resetOne} for every query a target covers. */
export function resetMany<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	partial?: PartialInput<TFactory>,
): Promise<void>;
export function resetMany(client: QueryClient, group: Group): Promise<void>;
export function resetMany<TTypes extends RootTypes, TParam = never>(
	client: QueryClient<TTypes>,
	target: TargetFor<TTypes, TParam>,
	...param: ParamArgs<NoInfer<TParam>>
): Promise<void>;
export function resetMany(
	client: QueryClient,
	target: AnyInvalidation,
	partial?: unknown,
): Promise<void> {
	return settle(
		entriesMatching(client, stampFor(target, partial, 0)).map(reset),
	);
}

/** {@link resetOne} for every query. */
export function resetAll(client: QueryClient): Promise<void> {
	return settle([...client["~entries"].values()].map(reset));
}

/** Remove one query from the cache, aborting its request. */
export function removeOne<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): void {
	const entry = oneEntry(client, factory, input[0]);
	if (entry) {
		remove(entry);
	}
}

/** {@link removeOne} for every query a target covers. */
export function removeMany<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	partial?: PartialInput<TFactory>,
): void;
export function removeMany(client: QueryClient, group: Group): void;
export function removeMany<TTypes extends RootTypes, TParam = never>(
	client: QueryClient<TTypes>,
	target: TargetFor<TTypes, TParam>,
	...param: ParamArgs<NoInfer<TParam>>
): void;
export function removeMany(
	client: QueryClient,
	target: AnyInvalidation,
	partial?: unknown,
): void {
	for (const entry of entriesMatching(client, stampFor(target, partial, 0))) {
		remove(entry);
	}
}

/** Remove every query, aborting their requests. */
export function removeAll(client: QueryClient): void {
	for (const entry of client["~entries"].values()) {
		remove(entry);
	}
}

/**
 * Write a query's data, as if a request had just returned it. `updater`
 * gets the current data, or `undefined` if there is none.
 */
export function setData<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	input: Parameters<TFactory>[0],
	updater:
		| ((previous: WritableData<TFactory> | undefined) => WritableData<TFactory>)
		| WritableData<TFactory>,
): void {
	const entry = entryOf(client, factory, input);
	const previous = entry.state.hasData ? entry.state.data : undefined;
	const data = isFunction(updater)
		? updater(
				// SAFETY: the entry's data is this factory's data.
				previous as never,
			)
		: updater;
	write(entry, data, client.clock.now(), ++client["~seq"]);
}

/** A query's cached data (before `select`), or `undefined`. */
export function getData<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): WritableData<TFactory> | undefined {
	const entry = oneEntry(client, factory, input[0]);
	// SAFETY: the entry's data is this factory's data.
	return (entry?.state.hasData ? entry.state.data : undefined) as
		| WritableData<TFactory>
		| undefined;
}

/** How many queries have a request in flight, optionally only a factory's, a group's or a target's. */
export function isFetching(
	client: QueryClient,
	target?: AnyInvalidation,
): number {
	const stamp: Stamp =
		target === undefined
			? { at: 0, kind: "all" }
			: stampFor(target, undefined, 0);
	return entriesMatching(client, stamp).filter(
		(entry) => entry.state.isFetching,
	).length;
}
