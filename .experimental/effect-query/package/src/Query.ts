/**
 * A query is a key, the Effect that loads it, and the schemas of the errors
 * it can fail with, like an `Rpc`'s. There is no options bag for retries,
 * timeouts or fallbacks: write them on the Effect (`Effect.retry`,
 * `Effect.timeout`, `Effect.catchTag`), and the error type follows. The cache
 * only adds what an Effect can't say about itself: how long a result stays
 * fresh.
 */
import { Duration, type Effect, Pipeable, Predicate } from "effect";

import type { Catchable } from "./route.ts";

export const TypeId = "~@raf-query/experimental-effect-query/Query";

export type TypeId = typeof TypeId;

/** A query's identity in the cache. Compared by value, after sorting object keys. */
export type Key = ReadonlyArray<unknown>;

export interface Query<out A, out E = never, out R = never>
	extends Pipeable.Pipeable {
	readonly effect: Effect.Effect<A, E, R>;
	/** The schemas of `E`'s members: what a boundary's hook checks to know whether anything is left. */
	readonly errors: ReadonlyArray<Catchable>;
	/** `key` as a string, for the cache's map. */
	readonly hash: string;
	readonly key: Key;
	/** How long a result stays fresh. A stale result still renders; `prefetch` refetches it. */
	readonly staleTime: Duration.Duration;
	readonly [TypeId]: {
		readonly _A: (_: never) => A;
		readonly _E: (_: never) => E;
		readonly _R: (_: never) => R;
	};
}

export type Any = Query<unknown, unknown, unknown>;

export type Success<Q> =
	Q extends Query<infer A, infer _E, infer _R> ? A : never;

export type Error<Q> = Q extends Query<infer _A, infer E, infer _R> ? E : never;

export type Services<Q> =
	Q extends Query<infer _A, infer _E, infer R> ? R : never;

const variance = {
	_A: (_: never) => _,
	_E: (_: never) => _,
	_R: (_: never) => _,
};

const Proto = {
	...Pipeable.Prototype,
	[TypeId]: variance,
};

export const isQuery = (u: unknown): u is Any =>
	Predicate.hasProperty(u, TypeId);

export const make = <
	A,
	R = never,
	const S extends ReadonlyArray<Catchable> = [],
>(options: {
	readonly effect: Effect.Effect<A, S[number]["Type"], R>;
	/**
	 * The query's errors: a schema for each error the Effect can fail with,
	 * such as its `Schema.TaggedError` classes, or `[]` when it can't fail.
	 * The Effect must fail with nothing else.
	 */
	readonly errors: S;
	readonly key: Key;
	readonly staleTime?: Duration.Input | undefined;
}): Query<A, S[number]["Type"], R> => {
	const self = Object.create(Proto);
	self.key = options.key;
	self.hash = hashKey(options.key);
	self.effect = options.effect;
	self.errors = options.errors;
	self.staleTime = Duration.fromInputUnsafe(options.staleTime ?? 0);
	return self;
};

/** Hashes a key so equal values hash the same, whatever their object key order. */
export const hashKey = (key: Key): string =>
	JSON.stringify(key, (_, value: unknown) =>
		Predicate.isObject(value) && !Array.isArray(value)
			? Object.fromEntries(
					Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)),
				)
			: value,
	);

/** Whether `prefix` is the start of `key`, element by element. */
export const matchesKey = (prefix: Key, key: Key): boolean =>
	prefix.length <= key.length &&
	prefix.every((part, i) => hashKey([part]) === hashKey([key[i]]));
