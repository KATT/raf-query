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
import { type AnyFactory, type Group, hashKey } from "./keys/keys.ts";
import {
	type AnyInvalidation,
	type AnyTarget,
	entryStamp,
	matches,
	type ParamArgs,
	type Stamp,
	stampFor,
	type Target,
} from "./keys/targets.ts";
import { isArray, isFunction } from "./guards.ts";
import {
	type InputArgs,
	type InputOf,
	optionsOf,
	type QueryFactory,
	type RootOfFactory,
} from "./options.ts";
import type { IsAnyRoot, RootTypes } from "./root.ts";
import type { InfiniteData } from "./infinite/infinite.ts";

type DeepPartial<T> = T extends object
	? { readonly [TName in keyof T]?: DeepPartial<T[TName]> }
	: T;

/**
 * What `invalidateMany(factory, partial)` takes: part of the factory's
 * input, whatever its key looks like.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation
 */
export type PartialInput<TFactory extends QueryFactory> = DeepPartial<
	InputOf<TFactory>
>;

/**
 * The clients a factory's verbs take: its root's, or any client for a
 * factory from an unbound builder.
 *
 * @see https://raf-query.katt.dev/docs/links-and-features#typing-meta-by-its-root
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

type ParamOf<TTarget> = TTarget extends {
	readonly where: (query: never, param: infer TParam) => boolean;
}
	? TParam
	: never;

/** A factory, if the client's root is its root; else nothing fits. */
type FactoryFor<TTypes extends RootTypes, TFactory extends QueryFactory> = [
	QueryClient<TTypes>,
] extends [ClientFor<TFactory>]
	? TFactory
	: never;

/** A target on its own, if it needs no parameter; else with its parameter. */
type BareTarget<TTypes extends RootTypes, TParam> =
	[] extends ParamArgs<TParam>
		? TargetFor<TTypes, TParam>
		: readonly [TargetFor<TTypes, TParam>, TParam];

type AnyItem =
	| AnyTarget
	| Group
	| QueryFactory
	| readonly [AnyTarget | QueryFactory, unknown];

/**
 * What one element of a target list must be, given what was passed: a
 * group, a factory of the client's root, a factory with a partial input, a
 * target, or a target with its parameter.
 */
type Item<TTypes extends RootTypes, TItem> = TItem extends Group
	? Group
	: TItem extends QueryFactory
		? FactoryFor<TTypes, TItem>
		: TItem extends AnyTarget
			? BareTarget<TTypes, ParamOf<TItem>>
			: TItem extends readonly [infer TFirst, unknown]
				? TFirst extends QueryFactory
					? readonly [FactoryFor<TTypes, TFirst>, PartialInput<TFirst>]
					: TFirst extends AnyTarget
						? readonly [TargetFor<TTypes, ParamOf<TFirst>>, ParamOf<TFirst>]
						: AnyItem
				: AnyItem;

/**
 * Several targets for one verb call, each checked on its own: a group, a
 * factory, `[factory, partial]`, a target, or `[target, param]`.
 */
export type TargetList<
	TTypes extends RootTypes,
	TItems extends ReadonlyArray<unknown>,
> = { readonly [TIndex in keyof TItems]: Item<TTypes, TItems[TIndex]> };

type AnyTargets =
	| AnyInvalidation
	| ReadonlyArray<AnyInvalidation | readonly [AnyInvalidation, unknown]>;

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

/** A stamp per target: one target and its argument, or each of a list. */
function stampsOf(
	targets: AnyTargets,
	arg: unknown,
	at: number,
): ReadonlyArray<Stamp> {
	const items: ReadonlyArray<
		AnyInvalidation | readonly [AnyInvalidation, unknown]
	> = isArray(targets) ? targets : [[targets, arg]];
	return items.map((item) =>
		isArray(item)
			? stampFor(item[0], item[1], at)
			: stampFor(item, undefined, at),
	);
}

function entriesMatching(
	client: QueryClient,
	stamps: ReadonlyArray<Stamp>,
): ReadonlyArray<Entry> {
	return [...client["~entries"].values()].filter((entry) =>
		stamps.some((stamp) => matches(entry, stamp)),
	);
}

function settle(outcomes: ReadonlyArray<Promise<Outcome>>): Promise<void> {
	return Promise.all(outcomes).then(() => {});
}

/**
 * Mark one query stale: a factory and its full input. If it's read, it
 * refetches; resolves when that settles.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation
 */
export function invalidateOne<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	return invalidate(client, (at) => [
		entryStamp(hashOf(factory, input[0]), at),
	]);
}

/**
 * Mark queries stale: a factory's (optionally only those whose input
 * matches `partial`), a group's (keys that start with its path, whether
 * the group built them or not), or those a target's `where` picks. Read
 * queries refetch now; the rest when next read. Resolves when the
 * refetches settle.
 *
 * Pass a list to invalidate several targets in one call: each query they
 * cover refetches once, and the refetches run side by side. Awaiting one
 * call after another runs them one after another instead.
 *
 * ```ts
 * await invalidateMany(client, [authors, [commentsQuery, { slug }], [ownedBy, "editorial"]]);
 * ```
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#several-targets
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
export function invalidateMany<
	TTypes extends RootTypes,
	const TItems extends ReadonlyArray<unknown>,
>(
	client: QueryClient<TTypes>,
	targets: TargetList<TTypes, TItems>,
): Promise<void>;
export function invalidateMany(
	client: QueryClient,
	target: AnyTargets,
	partial?: unknown,
): Promise<void> {
	return invalidate(client, (at) => stampsOf(target, partial, at));
}

/**
 * Mark every query stale; read ones refetch. For sign-out, or after any write.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation
 */
export function invalidateAll(client: QueryClient): Promise<void> {
	return invalidate(client, (at) => [{ at, kind: "all" }]);
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
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#invalidate-reset-or-remove
 */
export function resetOne<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...input: InputArgs<TFactory>
): Promise<void> {
	const entry = oneEntry(client, factory, input[0]);
	return settle(entry ? [reset(entry)] : []);
}

/**
 * {@link resetOne} for every query a target, or a list of them, covers.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#invalidate-reset-or-remove
 */
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
export function resetMany<
	TTypes extends RootTypes,
	const TItems extends ReadonlyArray<unknown>,
>(
	client: QueryClient<TTypes>,
	targets: TargetList<TTypes, TItems>,
): Promise<void>;
export function resetMany(
	client: QueryClient,
	target: AnyTargets,
	partial?: unknown,
): Promise<void> {
	return settle(
		entriesMatching(client, stampsOf(target, partial, 0)).map(reset),
	);
}

/**
 * {@link resetOne} for every query.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#invalidate-reset-or-remove
 */
export function resetAll(client: QueryClient): Promise<void> {
	return settle([...client["~entries"].values()].map(reset));
}

/**
 * Remove one query from the cache, aborting its request.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#invalidate-reset-or-remove
 */
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

/**
 * {@link removeOne} for every query a target, or a list of them, covers.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#invalidate-reset-or-remove
 */
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
export function removeMany<
	TTypes extends RootTypes,
	const TItems extends ReadonlyArray<unknown>,
>(client: QueryClient<TTypes>, targets: TargetList<TTypes, TItems>): void;
export function removeMany(
	client: QueryClient,
	target: AnyTargets,
	partial?: unknown,
): void {
	for (const entry of entriesMatching(client, stampsOf(target, partial, 0))) {
		remove(entry);
	}
}

/**
 * Remove every query, aborting their requests.
 *
 * @see https://raf-query.katt.dev/docs/query-invalidation#invalidate-reset-or-remove
 */
export function removeAll(client: QueryClient): void {
	for (const entry of client["~entries"].values()) {
		remove(entry);
	}
}

/** New data for `setData`, or a function from the current data to it. */
type Updater<TFactory extends QueryFactory> =
	| ((previous: WritableData<TFactory> | undefined) => WritableData<TFactory>)
	| WritableData<TFactory>;

/**
 * Write a query's data, as if a request had just returned it. `updater`
 * gets the current data, or `undefined` if there is none. A factory that
 * takes no input (or an optional one) skips the input:
 * `setData(client, feedQuery, updater)`.
 *
 * @see https://raf-query.katt.dev/docs/mutations#updates-from-mutation-responses
 */
export function setData<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...updater: [] extends Parameters<TFactory>
		? [updater: Updater<TFactory>]
		: never
): void;
export function setData<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	input: Parameters<TFactory> extends [] ? never : Parameters<TFactory>[0],
	updater: Updater<TFactory>,
): void;
export function setData<TFactory extends QueryFactory>(
	client: ClientFor<TFactory>,
	factory: TFactory,
	...args: ReadonlyArray<unknown>
): void {
	// By count, not by type: the data itself may be a function.
	const [input, updater] = args.length < 2 ? [undefined, args[0]] : args;
	const entry = entryOf(client, factory, input);
	const previous = entry.state.hasData ? entry.state.data : undefined;
	const data = isFunction(updater)
		? // SAFETY: the overloads type it as a function of this factory's data.
			(updater as (previous: unknown) => unknown)(previous)
		: updater;
	write(entry, data, client.clock.now(), ++client["~seq"]);
}

/**
 * A query's cached data (before `select`), or `undefined`.
 *
 * @see https://raf-query.katt.dev/docs/api-reference#changing-the-cache
 */
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

/**
 * How many queries have a request in flight, optionally only a factory's, a group's or a target's.
 *
 * @see https://raf-query.katt.dev/docs/background-fetching-indicators
 */
export function isFetching(
	client: QueryClient,
	target?: AnyInvalidation,
): number {
	const stamp: Stamp =
		target === undefined
			? { at: 0, kind: "all" }
			: stampFor(target, undefined, 0);
	return entriesMatching(client, [stamp]).filter(
		(entry) => entry.state.isFetching,
	).length;
}
