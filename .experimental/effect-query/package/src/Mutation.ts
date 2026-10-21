/**
 * A mutation is an Effect and the schemas of the errors it can fail with,
 * like a query without a key. A boundary's `useRun()` runs it, and the
 * schemas tell it whether the boundaries above catch every error, the same
 * way they do for a query.
 */
import { type Effect, Pipeable, Predicate } from "effect";

import type { Catchable } from "./route.ts";

export const TypeId = "~@raf-query/experimental-effect-query/Mutation";

export type TypeId = typeof TypeId;

export interface Mutation<out A, out E = never, out R = never>
	extends Pipeable.Pipeable {
	readonly effect: Effect.Effect<A, E, R>;
	/** The schemas of `E`'s members. */
	readonly errors: ReadonlyArray<Catchable>;
	readonly [TypeId]: {
		readonly _A: (_: never) => A;
		readonly _E: (_: never) => E;
		readonly _R: (_: never) => R;
	};
}

export type Any = Mutation<unknown, unknown, unknown>;

const variance = {
	_A: (_: never) => _,
	_E: (_: never) => _,
	_R: (_: never) => _,
};

const Proto = {
	...Pipeable.Prototype,
	[TypeId]: variance,
};

export const isMutation = (u: unknown): u is Any =>
	Predicate.hasProperty(u, TypeId);

export const make = <
	A,
	R = never,
	const S extends ReadonlyArray<Catchable> = [],
>(options: {
	readonly effect: Effect.Effect<A, S[number]["Type"], R>;
	/** The mutation's errors: a schema for each error the Effect can fail with, or `[]` when it can't fail. */
	readonly errors: S;
}): Mutation<A, S[number]["Type"], R> => {
	const self = Object.create(Proto);
	self.effect = options.effect;
	self.errors = options.errors;
	return self;
};
