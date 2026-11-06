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
	entryStamp,
	type Group,
	hashKey,
	matches,
	type ParamOf,
	type Stamp,
	stampFor,
	type TagDef,
	type Target,
} from "./keys.ts";
import { isFunction } from "./guards.ts";
import {
	type InputArgs,
	type KeyOf,
	optionsOf,
	type QueryFactory,
} from "./options.ts";
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
 * Mark one query stale (a factory and its full input), or every query with
 * one tag (a tag definition and its parameter). Read queries refetch;
 * resolves when they settle.
 */
export function invalidateOne<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void>;
export function invalidateOne<TDef extends TagDef<never>>(
	client: QueryClient,
	tag: TDef,
	param: ParamOf<TDef>,
): Promise<void>;
export function invalidateOne(
	client: QueryClient,
	target: AnyFactory | TagDef<never>,
	arg?: unknown,
): Promise<void> {
	return invalidate(client, (at) =>
		isFunction(target)
			? entryStamp(hashOf(target, arg), at)
			: stampFor(target, arg, at),
	);
}

/**
 * Mark queries stale: a group's (and its subgroups'), a tag's, or a
 * factory's, optionally only those whose input matches `partial`. Read
 * queries refetch now; the rest refetch when next read. Resolves when the
 * refetches settle.
 */
export function invalidateMany(
	client: QueryClient,
	target: Group | TagDef<never>,
): Promise<void>;
export function invalidateMany<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	partial?: PartialInput<TFactory>,
): Promise<void>;
export function invalidateMany(
	client: QueryClient,
	target: Target,
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
	client: QueryClient,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	const entry = oneEntry(client, factory, input[0]);
	return settle(entry ? [reset(entry)] : []);
}

/** {@link resetOne} for every query a target covers. */
export function resetMany(
	client: QueryClient,
	target: Group | TagDef<never>,
): Promise<void>;
export function resetMany<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	partial?: PartialInput<TFactory>,
): Promise<void>;
export function resetMany(
	client: QueryClient,
	target: Target,
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
	client: QueryClient,
	factory: TFactory,
	...input: InputArgs<TFactory>
): void {
	const entry = oneEntry(client, factory, input[0]);
	if (entry) {
		remove(entry);
	}
}

/** {@link removeOne} for every query a target covers. */
export function removeMany(
	client: QueryClient,
	target: Group | TagDef<never>,
): void;
export function removeMany<TFactory extends QueryFactory>(
	client: QueryClient,
	factory: TFactory,
	partial?: PartialInput<TFactory>,
): void;
export function removeMany(
	client: QueryClient,
	target: Target,
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
	client: QueryClient,
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
	client: QueryClient,
	factory: TFactory,
	...input: InputArgs<TFactory>
): WritableData<TFactory> | undefined {
	const entry = oneEntry(client, factory, input[0]);
	// SAFETY: the entry's data is this factory's data.
	return (entry?.state.hasData ? entry.state.data : undefined) as
		| WritableData<TFactory>
		| undefined;
}

/** How many queries have a request in flight, optionally only a target's. */
export function isFetching(client: QueryClient, target?: Target): number {
	const stamp: Stamp =
		target === undefined
			? { at: 0, kind: "all" }
			: stampFor(target, undefined, 0);
	return entriesMatching(client, stamp).filter(
		(entry) => entry.state.isFetching,
	).length;
}
