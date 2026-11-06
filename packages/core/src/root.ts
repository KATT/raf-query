/**
 * Root types, the way tRPC v12 types a client from its links: each link and
 * feature declares the `meta` fields it reads, a client's `meta` is what its
 * parts declare, and factories name their root with a phantom `def`.
 */

/** A query's `meta` when its factory doesn't name a root. */
export type QueryMeta = Readonly<Record<string, unknown>>;

/** What a link or feature declares: the `meta` fields it reads. */
export interface Decl {
	readonly meta?: object;
}

/** A root's types. */
export interface RootTypes {
	readonly meta: object;
}

/** The root of a factory without `def`. A type only, never a value. */
export interface DefaultTypes {
	readonly "~default": true;
	readonly meta: QueryMeta;
}

/**
 * The root of a client typed only as `QueryClient`: any root. The one way
 * an invariant phantom takes every root.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- see above
export type AnyRoot = any;

/** Whether `TTypes` is {@link AnyRoot}. */
export type IsAnyRoot<TTypes> = 0 extends 1 & TTypes ? true : false;

/**
 * Phantom carrier of a part's declaration, `undefined` at runtime.
 * Invariant, so a part that declares nothing doesn't absorb the
 * declarations of the others in an array.
 */
export interface Declares<TDecl extends Decl> {
	readonly "~decl"?: {
		readonly in: (decl: TDecl) => void;
		readonly out: TDecl;
	};
}

/** Any link or feature, whatever it declares. */
export interface AnyPart {
	readonly "~decl"?: {
		readonly in: (decl: never) => void;
		readonly out: unknown;
	};
}

/**
 * The `meta` a declaration adds to its root. Every declared key is present
 * and may be `undefined`: roots of all-optional metas would be assignable to
 * one another. Queries pass a `Partial` of it.
 */
export type MetaOfDecl<TDecl> = TDecl extends {
	readonly meta?: infer TMeta extends object;
}
	? Present<TMeta>
	: unknown;

/**
 * Every key of `T` required, its value possibly `undefined`. Mapping over
 * `Exclude<keyof T, never>` rather than `keyof T` drops the modifiers
 * without dropping `undefined`, which `-?` would.
 */
type Present<T> = { readonly [K in Exclude<keyof T, never>]: T[K] | undefined };

type DeclOf<TPart> = TPart extends {
	readonly "~decl"?: { readonly out: infer TDecl };
}
	? TDecl
	: never;

type Intersect<TUnion> = (
	TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never;

type Flat<T> = { readonly [K in keyof T]: T[K] };

/** A root's `meta`: what its links and features declare. */
export type MetaOf<TParts extends ReadonlyArray<AnyPart>> = [
	DeclOf<TParts[number]>,
] extends [never]
	? Flat<unknown>
	: Flat<Intersect<MetaOfDecl<DeclOf<TParts[number]>>>>;

declare const defBrand: unique symbol;

/** Phantom carrier of a factory's root. `undefined` at runtime. */
export interface Def<TTypes extends RootTypes> {
	readonly [defBrand]: TTypes;
}

/** A root's types, from a client or from a function that makes one. */
export type RootOf<T> = T extends (...args: never) => infer TClient
	? RootOf<TClient>
	: T extends {
				readonly "~types"?: {
					readonly root: (types: infer TTypes extends RootTypes) => unknown;
				};
		  }
		? TTypes
		: never;

/**
 * Tie a factory to a root, so its `meta` is checked against what the root's
 * links and features read, and verbs only take that root's clients. Takes
 * the client type or a function that makes the client, and returns
 * `undefined`.
 *
 * ```ts
 * import type { makeQueryClient } from "./raf";
 * queryOptions({ def: defType<typeof makeQueryClient>(), meta: { retry: false }, … });
 * ```
 */
export function defType<T>(): Def<RootOf<T>> {
	// SAFETY: a phantom; only its type is read.
	return undefined as unknown as Def<RootOf<T>>;
}
