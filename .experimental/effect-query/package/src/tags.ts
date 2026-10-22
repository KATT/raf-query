/**
 * What boundaries check at the type level. Errors are named by `_tag`, and
 * checked against the errors the root says its queries can fail with (the
 * universe). Only types: at runtime a boundary has a set of tags.
 */
import type { Rpc, RpcClientError, RpcGroup, RpcSchema } from "effect/rpc";

declare const ErrorsTypeId: unique symbol;

/**
 * The errors queries under a root can fail with, as a type. A phantom: at
 * runtime it is an empty object, so declaring it imports nothing.
 */
export interface Errors<out U> {
	readonly [ErrorsTypeId]: () => U;
}

/** Declares a root's universe: `Boundary.errors<Unauthorized | Forbidden>()`. */
export const errors = <U = never>(): Errors<U> =>
	// SAFETY: `Errors` has no runtime members; only types read `U`.
	({}) as Errors<U>;

/**
 * What an RPC client call can fail with, for every procedure of the groups:
 * each one's `error`, its middlewares' errors, a stream's error, and the
 * transport's `RpcClientError`.
 */
export type RpcErrors<G> =
	G extends RpcGroup.RpcGroup<infer Rpcs> ? ErrorsOfRpcs<Rpcs> : never;

type ErrorsOfRpcs<Rpcs> =
	Rpcs extends Rpc.Rpc<
		infer _Tag,
		infer _Payload,
		infer Success,
		infer Failure,
		infer Middleware,
		infer _Requires
	>
		?
				| Failure["Type"]
				| Middleware["error"]["Type"]
				| Middleware["~ClientError"]
				| (Success extends RpcSchema.Stream<infer _A, infer E>
						? E["Type"]
						: never)
				| RpcClientError.RpcClientError
		: never;

/** The literal `_tag`s of `E`'s members; a `_tag: string` names none. */
export type TagsOf<E> = E extends { readonly _tag: infer T extends string }
	? string extends T
		? never
		: T
	: never;

/** Whatever carries one of `Tags`: what a boundary that catches them takes. */
export interface WithTag<Tags extends string> {
	readonly _tag: Tags;
}

type UnionToIntersection<U> = (
	U extends unknown ? (_: U) => void : never
) extends (_: infer I) => void
	? I
	: never;

type IsUnion<X> = [X] extends [UnionToIntersection<X>] ? false : true;

/** The tags in `Tags` that more than one type in `U` carries: tag matching can't tell them apart. */
export type SharedTags<U, Tags extends string> = Tags extends unknown
	? IsUnion<Extract<U, WithTag<Tags>>> extends true
		? Tags
		: never
	: never;

/** `tags`' extra type when a boundary above already catches one of them. */
export type NotYetHandled<Tags extends string, Handled extends string> = [
	Extract<Tags, Handled>,
] extends [never]
	? unknown
	: { readonly AlreadyHandledAbove: Extract<Tags, Handled> };

/** `tags`' extra type: names what's wrong with them, so the error says it. */
export type TagChecks<U, Handled extends string, Tags extends string> = ([
	Tags,
] extends [never]
	? { readonly AtLeastOneTag: true }
	: unknown) &
	NotYetHandled<Tags, Handled> &
	([SharedTags<U, Tags>] extends [never]
		? unknown
		: { readonly TagSharedByMoreThanOneError: SharedTags<U, Tags> });

/** What `tags` must be when the root declares no errors: says how to fix it. */
export type NoUniverse =
	"The root declares no errors to catch: pass `errors: Boundary.errors<E>()` to `Boundary.root`";

/** `tags`' constraint: each one a tag of the universe. */
export type Catchable<U> = ReadonlyArray<
	[TagsOf<U>] extends [never] ? NoUniverse : TagsOf<U>
>;

/** What's left of `E` once a chain catches `Handled`: by tag, as at runtime. */
export type Left<E, Handled extends string> = Exclude<E, WithTag<Handled>>;

/**
 * Tags a chain catches that `E` carries under a type the universe doesn't
 * have for them: the fallback would get a value its props don't describe. A
 * member with `_tag: string` could carry any of them.
 */
type Mismatched<E, Handled extends string, U> = E extends {
	readonly _tag: infer T extends string;
}
	? string extends T
		? Handled
		: T extends Handled
			? [E] extends [Extract<U, WithTag<T>>]
				? never
				: T
			: never
	: never;

/** A hook argument's extra type: names tags caught under another type. */
export type MatchesUniverse<E, Handled extends string, U> = [
	Mismatched<E, Handled, U>,
] extends [never]
	? unknown
	: { readonly CaughtAsAnotherType: Mismatched<E, Handled, U> };
