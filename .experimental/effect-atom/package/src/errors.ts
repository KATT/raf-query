/**
 * Errors as types: the universe a root declares, the tag checks `catchErrors`
 * runs against it, and the narrowing a hook does. Nothing here exists at
 * runtime, so the modules that declare boundaries can import their errors
 * with `import type`.
 */
import type { Rpc, RpcClientError, RpcGroup, RpcSchema } from "effect/rpc";

const ErrorsTypeId = "~@raf-query/experimental-effect-atom/Errors";

/**
 * The errors atoms under a root can fail with, as a type. A phantom: at
 * runtime it is an empty object, so declaring it imports nothing.
 */
export interface Errors<out U> {
	readonly [ErrorsTypeId]: () => U;
}

export const errors = <U = never>(): Errors<U> =>
	// SAFETY: `Errors` has no runtime members; `U` is only read by types.
	({}) as Errors<U>;

/**
 * What an RPC client call can fail with, for every procedure of the group:
 * each one's `error`, its middlewares' errors, a stream's error, and the
 * transport's `RpcClientError`. The same union `AtomRpc` gives a query's `E`.
 */
export type RpcErrors<G> =
	G extends RpcGroup.RpcGroup<infer Rpcs> ? ErrorsOfRpcs<Rpcs> : never;

type ErrorsOfRpcs<Rpcs> =
	Rpcs extends Rpc.Rpc<
		infer _Tag,
		infer _Payload,
		infer Success,
		infer Error,
		infer Middleware,
		infer _Requires
	>
		?
				| Error["Type"]
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

/** The tags in `Tags` that more than one type in `U` carries. */
export type SharedTags<U, Tags extends string> = Tags extends unknown
	? IsUnion<Extract<U, WithTag<Tags>>> extends true
		? Tags
		: never
	: never;

/** `tags`' extra type: it names what's wrong with them, so the error says it. */
export type TagChecks<U, Handled extends string, Tags extends string> = ([
	Tags,
] extends [never]
	? { readonly AtLeastOneTag: true }
	: unknown) &
	([Extract<Tags, Handled>] extends [never]
		? unknown
		: { readonly AlreadyHandledAbove: Extract<Tags, Handled> }) &
	([SharedTags<U, Tags>] extends [never]
		? unknown
		: { readonly TagSharedByMoreThanOneError: SharedTags<U, Tags> });

/** What's left of `E` once the chain catches `Handled`: by tag, as at runtime. */
export type Left<E, Handled extends string> = Exclude<E, WithTag<Handled>>;

/**
 * Tags the chain catches that `E` carries under a type the universe doesn't
 * have for them: the fallback would get a value its props don't describe. A
 * member with `_tag: string` could carry any of them.
 */
export type Mismatched<E, Handled extends string, U> = E extends {
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

/** An atom's extra type at a hook: names the tags it carries under another type. */
export type MatchesUniverse<E, Handled extends string, U> = [
	Mismatched<E, Handled, U>,
] extends [never]
	? unknown
	: { readonly CaughtAsAnotherType: Mismatched<E, Handled, U> };

/** What `tags` must be when the root declares no errors: it says how to fix that. */
export type NoUniverse =
	"The root declares no errors to catch: pass `errors: Boundary.errors<E>()` to `Boundary.root`";
