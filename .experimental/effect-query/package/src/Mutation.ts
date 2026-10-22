/**
 * A mutation is an Effect to run from an event, like a query without a key.
 * `Boundary.useRun(boundary)` runs it: the errors the boundary's chain
 * catches go there, and the rest come back as an `Unhandled`.
 */
import { type Effect, Pipeable, Predicate } from "effect";

export const TypeId = "~@raf-query/experimental-effect-query/Mutation";

export type TypeId = typeof TypeId;

export interface Mutation<out A, out E = never, out R = never>
	extends Pipeable.Pipeable {
	readonly effect: Effect.Effect<A, E, R>;
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

export const make = <A, E = never, R = never>(options: {
	readonly effect: Effect.Effect<A, E, R>;
}): Mutation<A, E, R> => {
	const self = Object.create(Proto);
	self.effect = options.effect;
	return self;
};
