/**
 * Root types, the way tRPC v12 types a client from its links: each plugin
 * declares the per-query options it reads and what it gives every
 * `queryFn`, a client's root is what its plugins declare, and builders bound
 * to a root (`bindQueryOptions`) carry it as a phantom on the options they
 * build. A client runs a factory when it has at least the plugins the
 * factory's builder names.
 */

/**
 * What a plugin declares: the per-query `options` it reads, and the `context`
 * it gives every `queryFn`, for the client or per request from its link.
 *
 * @see https://raf-query.katt.dev/docs/plugins#writing-a-plugin
 */
export interface Decl {
	readonly context?: object;
	readonly options?: object;
}

/** What a plugin that reads no option and gives no context declares. */
export interface NoDecl {
	readonly options?: object;
}

/** A root's types: what a client's plugins declare, together. */
export interface RootTypes {
	readonly "~options": object;
	readonly context: object;
	readonly options: object;
}

declare const optionalDecl: unique symbol;

/**
 * In a library's binding: a plugin whose options its queries set where the
 * client has it, without needing it.
 *
 * ```ts
 * const queryOptions = bindQueryOptions<Convex & Optional<Retry>>();
 * ```
 *
 * @see https://raf-query.katt.dev/docs/plugins#binding-a-library-to-plugins
 */
export interface Optional<TDecl extends Decl> {
	readonly [optionalDecl]?: TDecl;
}

/**
 * Phantom carrier of a plugin's declaration, `undefined` at runtime.
 * Invariant, so a plugin that declares nothing doesn't absorb the
 * declarations of the others in an array.
 */
export interface Declares<TDecl extends Decl> {
	readonly "~decl"?: {
		readonly in: (decl: TDecl) => void;
		readonly out: TDecl;
	};
}

/** Any plugin's phantom, whatever it declares. */
export interface AnyDeclares {
	readonly "~decl"?: {
		readonly in: (decl: never) => void;
		readonly out: unknown;
	};
}

/** The options a declaration adds to its root. */
export type OptionsOfDecl<TDecl> = TDecl extends {
	readonly options?: infer TOptions extends object;
}
	? TOptions
	: unknown;

/** The `queryFn` context a declaration adds to its root. */
export type ContextOfDecl<TDecl> = TDecl extends {
	readonly context?: infer TContext extends object;
}
	? TContext
	: unknown;

/**
 * Every key of `T` required, its value possibly `undefined`: a root whose
 * options were all optional would be assignable from a root without them.
 * Mapping over `Exclude<keyof T, never>` rather than `keyof T` drops the
 * modifiers without dropping `undefined`, which `-?` would.
 *
 * A conditional type, like {@link Plain} and {@link Root}, so the result is
 * a plain object type that TypeScript compares field by field. As an alias
 * of a mapped type, it compares `Root<A>` with `Root<A & B>` by a variance
 * it measures wrong, and takes a client that lacks a plugin for one that has it.
 */
type Present<T> = T extends unknown
	? { readonly [K in Exclude<keyof T, never>]: T[K] | undefined }
	: never;

type Plain<T> = T extends unknown ? { readonly [K in keyof T]: T[K] } : never;

/**
 * Each option as a function of its own type, so two roots agree on an
 * option only when its type is the same in both. A client's plugins read
 * the options a factory sets: a factory built for `owner?: string` must not
 * run on a client whose plugin reads `owner?: "a" | "b"`. The key set stays
 * open, so a client with more plugins still runs the factory.
 */
type Exact<T> = T extends unknown
	? { readonly [K in Exclude<keyof T, never>]: (value: T[K]) => T[K] }
	: never;

/**
 * The root of a declaration, or of several intersected. Every declared
 * option is present and may be `undefined`; queries set a `Partial` of them.
 */
export type Root<TDecl> = TDecl extends unknown
	? {
			/** Phantom: holds each option's type exactly, for comparing roots. */
			readonly "~options": Exact<OptionsOfDecl<TDecl>>;
			readonly context: Plain<ContextOfDecl<TDecl>>;
			readonly options: Present<OptionsOfDecl<TDecl>>;
		}
	: never;

/**
 * The root of a client with no plugins, and of a builder bound to none. Every
 * client has it, so the bare `QueryClient` type takes any client.
 */
export type NoPlugins = Root<unknown>;

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

/** A client's root: what its plugins declare. */
export type RootOfPlugins<TPlugins extends ReadonlyArray<AnyDeclares>> = [
	DeclOf<TPlugins[number]>,
] extends [never]
	? NoPlugins
	: Root<Intersect<DeclOf<TPlugins[number]>>>;

declare const rootBrand: unique symbol;

/** Phantom carrier of the root a factory's builder is bound to. Never set at runtime. */
export interface RootTag<TTypes extends RootTypes> {
	readonly [rootBrand]: TTypes;
}

/** A client's root, from the client or from a function that makes one. `never` for anything else. */
type RootOfClient<T> = T extends (...args: never) => infer TClient
	? RootOfClient<TClient>
	: T extends { readonly "~types"?: { readonly root: infer TTypes } }
		? TTypes extends RootTypes
			? TTypes
			: never
		: never;

type WithoutOptional<T> = Omit<T, typeof optionalDecl>;

type OptionalOf<T> = T extends { readonly [optionalDecl]?: infer TDecl }
	? TDecl
	: unknown;

/**
 * The root a builder is bound to: a client's, the root of a function that
 * makes one, or the root of the plugins a library names by their
 * declarations. `QueryClient<RootOf<Convex>>` is a client that has the plugin
 * that declares `Convex`.
 *
 * @see https://raf-query.katt.dev/docs/plugins#binding-a-library-to-plugins
 */
export type RootOf<T> = [RootOfClient<T>] extends [never]
	? Root<WithoutOptional<T>>
	: RootOfClient<T>;

/**
 * The options a bound builder takes: its root's, and those of the plugins a
 * library named as {@link Optional}.
 */
export type SetsOf<T> = [RootOfClient<T>] extends [never]
	? Root<WithoutOptional<T> & OptionalOf<T>>
	: RootOfClient<T>;
