"use client";

/**
 * Typed error boundaries for queries whose `queryFn` returns an Effect. A
 * chain of boundaries reads like an Effect pipeline laid over the component
 * tree: the root catches defects and interrupts, and each boundary below it
 * is `Effect.catchTags` for the subtree it wraps.
 *
 * Errors are named by `_tag`, checked against the error universe the root
 * declares as a type, so the modules that declare boundaries and read
 * through them import their errors with `import type`:
 *
 * ```tsx
 * type AppError = Boundary.RpcErrors<typeof DocRpcs>;
 * const [App] = Boundary.root({ client, errors: Boundary.errors<AppError>(), name: "App", fallback: Crashed });
 * const [Session, useSession] = Boundary.catchErrors(App, {
 *   name: "Session",
 *   tags: ["Unauthorized"],
 *   fallback: SignIn,
 * });
 *
 * // Under <App><Session>:
 * const doc = useSession(docQuery, handle); // Doc | Unhandled<DocNotFound | Forbidden>
 * ```
 *
 * The types come from the boundary a component reads through, so they are
 * only true if it is rendered inside it: every hook checks, and throws if it
 * isn't.
 */
import {
	type DataOf,
	type ErrorOf,
	exitThenable,
	Query,
	type QueryCache,
	type QueryClient,
	type QueryFactory,
	type QueryHandle,
	QueryObserver,
	type UseQueryOptions,
} from "@raf-query/core";
import { Cause, Effect, Exit, Predicate } from "effect";
import {
	Component,
	createContext,
	createElement,
	type ReactNode,
	use,
	useMemo,
	useState,
} from "react";

import {
	QueryClientProvider,
	useOptionalQueryClient,
	useQueryClient,
} from "../provider.tsx";
import { useObservedQuery } from "../use-query.ts";
import type {
	Errors,
	Left,
	MatchesUniverse,
	NoUniverse,
	TagChecks,
	TagsOf,
	WithTag,
} from "./errors.ts";
import { type Link, rootOf, route } from "./route.ts";

export * from "./errors.ts";

export const TypeId = "~@raf-query/react/Boundary";

export type TypeId = typeof TypeId;

export interface FallbackProps<E> {
	readonly error: E;
	/**
	 * Renders the boundary's children again. First loads that failed and that
	 * nothing on screen shows start over as they are read.
	 */
	readonly retry: () => void;
}

export interface RootFallbackProps {
	/** Why it failed: a defect, an interrupt, or a failure of a `queryFn` with no typed error. */
	readonly cause: Cause.Cause<unknown>;
	/** Renders the app again; failed first loads start over as they are read. */
	readonly retry: () => void;
}

const UnhandledTypeId = "~@raf-query/react/Boundary/Unhandled";

/** A typed failure no boundary in the chain catches, handed back to the component that read it. */
export interface Unhandled<E> {
	readonly cause: Cause.Cause<E>;
	readonly error: E;
	readonly [UnhandledTypeId]: typeof UnhandledTypeId;
}

export function isUnhandled<A, E>(
	value: A | Unhandled<E>,
): value is Unhandled<E> {
	return Predicate.hasProperty(value, UnhandledTypeId);
}

/**
 * What a read gives back: the data when the chain catches every error the
 * query can fail with, or else the data or what's left, as an `Unhandled`.
 */
export type Read<A, E> = [E] extends [never] ? A : A | Unhandled<E>;

/**
 * The errors a boundary reads of a factory: its `queryFn` Effect's. A
 * `queryFn` that returns a promise has no typed error (`unknown`); its
 * failures go to the root, as a defect's do, so there is none to read.
 */
export type TypedErrorOf<TFactory extends QueryFactory> =
	unknown extends ErrorOf<TFactory> ? never : ErrorOf<TFactory>;

export interface RootOptions<R, U> {
	/**
	 * A client to provide to the tree. Without one, the root reads the
	 * nearest `QueryClientProvider`'s (or `QueryProvider`'s) and its services
	 * are the root's first type argument.
	 */
	readonly client?: QueryClient<R>;
	/**
	 * The errors the boundaries under the root can catch, as a type:
	 * `Boundary.errors<Boundary.RpcErrors<typeof Rpcs>>()`, say. Without a
	 * `client`, give it as the second type argument instead.
	 */
	readonly errors?: Errors<U>;
	/** Rendered instead of the app while a defect, an interrupt or an untyped failure stands. */
	readonly fallback: (props: RootFallbackProps) => ReactNode;
	/** The boundary's name, for error messages, `caughtBy` and React DevTools. */
	readonly name: string;
}

/** What every boundary is, whatever it handles. */
export interface AnyBoundary extends Link {
	/** Renders the boundary around `children`. Its parent must be above it. */
	(props: { readonly children?: ReactNode }): ReactNode;
	readonly parent: AnyBoundary | undefined;
	/** Type only. */
	readonly [TypeId]: {
		readonly handled: () => string;
		readonly services: () => unknown;
		readonly universe: () => unknown;
	};
}

/**
 * Element 0 of `root` and `catchErrors`: the component that renders the
 * boundary, and the handle {@link catchErrors} takes to nest another inside
 * it. `U` is the root's error universe; `Handled`, the tags it and the
 * boundaries above it catch; `R`, the services its client provides.
 */
export interface Boundary<U, Handled extends string, R> extends AnyBoundary {
	readonly [TypeId]: {
		readonly handled: () => Handled;
		readonly services: () => R;
		readonly universe: () => U;
	};
}

/** The error universe a boundary's root declares. */
export type UniverseOf<B> =
	B extends Boundary<infer U, infer _Handled, infer _R> ? U : never;

/** The tags a boundary and the ones above it catch. */
export type HandledBy<B> =
	B extends Boundary<infer _U, infer Handled, infer _R> ? Handled : never;

/** The services a boundary's client provides. */
export type ServicesOfBoundary<B> =
	B extends Boundary<infer _U, infer _Handled, infer R> ? R : never;

/** Element 1 of `root` and `catchErrors`: reads queries through the boundary. */
export interface UseBoundary<U, Handled extends string> {
	/**
	 * Reads the query a handle points at, suspending until its first result.
	 * Errors a boundary in the chain catches go there; the rest come back as
	 * an `Unhandled`. When the chain catches them all, it returns the data.
	 */
	<TFactory extends QueryFactory>(
		factory: TFactory,
		handle: QueryHandle<TFactory> &
			MatchesUniverse<TypedErrorOf<TFactory>, Handled, U>,
		options?: UseQueryOptions,
	): Read<DataOf<TFactory>, Left<TypedErrorOf<TFactory>, Handled>>;
}

/** {@link useRun}'s function: runs Effects (mutations) with the client's services, narrowed by the boundary. */
export interface Run<U, Handled extends string, R> {
	/**
	 * Resolves with the success, or with what no boundary in the chain
	 * catches, as an `Unhandled`. A failure one catches goes there, and the
	 * promise never settles.
	 */
	<A, E, Q extends QueryCache.QueryCache | R>(
		effect: Effect.Effect<A, E, Q> & MatchesUniverse<E, Handled, U>,
	): Promise<Read<A, Left<E, Handled>>>;
}

type CatchableTags<B> = [TagsOf<UniverseOf<B>>] extends [never]
	? NoUniverse
	: TagsOf<UniverseOf<B>>;

/** `tags`' constraint: each one a tag of the universe. */
export type Catchable<B> = ReadonlyArray<CatchableTags<B>>;

export interface CatchOptions<B, T extends ReadonlyArray<string>> {
	/** Rendered instead of the children while a caught failure stands. A component, so it can use hooks. */
	readonly fallback: (
		props: FallbackProps<Extract<UniverseOf<B>, WithTag<T[number]>>>,
	) => ReactNode;
	/** The boundary's name, for error messages, `caughtBy` and React DevTools. */
	readonly name: string;
	/** The `_tag`s this boundary catches: tags of the universe that no boundary above catches. */
	readonly tags: T & TagChecks<UniverseOf<B>, HandledBy<B>, T[number]>;
}

export function isBoundary(u: unknown): u is AnyBoundary {
	return Predicate.hasProperty(u, TypeId);
}

interface Mounted {
	readonly boundaries: ReadonlySet<Link>;
}

const MountedContext = createContext<Mounted | undefined>(undefined);

const EscalationTypeId = "~@raf-query/react/Boundary/Escalation";

/** What a hook throws to send a failure to a boundary above it. */
class Escalation extends Error {
	readonly [EscalationTypeId] = EscalationTypeId;
	readonly boundary: AnyBoundary;
	override readonly cause: Cause.Cause<unknown>;
	readonly error: unknown;
	constructor(
		boundary: AnyBoundary,
		error: unknown,
		cause: Cause.Cause<unknown>,
	) {
		super(`${boundary.displayName} caught: ${Cause.pretty(cause)}`);
		this.name = "Escalation";
		this.boundary = boundary;
		this.cause = cause;
		this.error = error;
	}
}

function isEscalation(u: unknown): u is Escalation {
	return Predicate.hasProperty(u, EscalationTypeId);
}

export interface Caught {
	/** The boundary that renders its fallback for it. */
	readonly boundary: AnyBoundary;
	readonly cause: Cause.Cause<unknown>;
	/** The typed failure, or `undefined` when the root caught a defect, an interrupt or an untyped failure. */
	readonly error: unknown;
}

/**
 * For `createRoot`'s `onCaughtError`: which boundary caught `u`, and why,
 * when `u` is a failure a hook sent to a boundary. `undefined` for anything
 * else React caught, such as an error thrown while rendering.
 */
export function caughtBy(u: unknown): Caught | undefined {
	return isEscalation(u)
		? { boundary: u.boundary, cause: u.cause, error: u.error }
		: undefined;
}

interface Impl extends AnyBoundary {
	readonly client: QueryClient<unknown> | undefined;
	readonly fallback: (props: FallbackProps<unknown>) => ReactNode;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => ReactNode;
}

interface CatcherProps {
	readonly boundary: Impl;
	readonly children?: ReactNode;
	readonly client: QueryClient<unknown> | null;
}

/**
 * A first load that failed and that nothing on screen shows. The fallback
 * unmounted its readers, and the ones it never rendered (React stops at the
 * first sibling that throws) haven't read their failure yet either.
 */
function isUnshownFailure(query: Query.Query) {
	const state = Query.getUnsafe(query);
	return (
		state.status === "error" &&
		!state.hasData &&
		Query.observerCountUnsafe(query) === 0
	);
}

interface CatcherState {
	readonly caught: { readonly value: unknown } | undefined;
}

class Catcher extends Component<CatcherProps, CatcherState> {
	override state: CatcherState = { caught: undefined };

	static getDerivedStateFromError(value: unknown): CatcherState {
		return { caught: { value } };
	}

	/** Drops the failed first loads nothing shows, so the children refetch them as they render again. */
	retry = () => {
		const client = this.props.client;
		if (client !== null) {
			Effect.runFork(client.effect.reset({ predicate: isUnshownFailure }));
		}
		this.setState({ caught: undefined });
	};

	override render() {
		const boundary = this.props.boundary;
		if (this.state.caught === undefined) {
			return this.props.children;
		}
		const value = this.state.caught.value;
		if (boundary.parent === undefined) {
			return createElement(boundary.rootFallback, {
				cause: isEscalation(value) ? value.cause : Cause.die(value),
				retry: this.retry,
			});
		}
		if (isEscalation(value) && value.boundary === boundary) {
			return createElement(boundary.fallback, {
				error: value.error,
				retry: this.retry,
			});
		}
		// Not ours: a boundary further up takes it.
		throw value;
	}
}

function useMounted(boundary: AnyBoundary) {
	const mounted = use(MountedContext);
	if (mounted === undefined || !mounted.boundaries.has(boundary)) {
		throw new Error(
			`Boundary "${boundary.displayName}": its hook needs <${boundary.displayName}> above it.`,
		);
	}
}

/** One `Unhandled` per failed read, so a re-render hands back the same value. */
const unhandledByExit = new WeakMap<
	Exit.Exit<unknown, unknown>,
	Unhandled<unknown>
>();

function unhandledOf(
	exit: Exit.Failure<unknown, unknown>,
	error: unknown,
): Unhandled<unknown> {
	const existing = unhandledByExit.get(exit);
	if (existing !== undefined) {
		return existing;
	}
	const unhandled: Unhandled<unknown> = {
		cause: exit.cause,
		error,
		[UnhandledTypeId]: UnhandledTypeId,
	};
	unhandledByExit.set(exit, unhandled);
	return unhandled;
}

/**
 * The success, the failure to hand back, or a throw to the boundary that
 * takes it. `untyped` failures (a promise `queryFn`'s) go to the root.
 */
function settle(
	boundary: Impl,
	exit: Exit.Exit<unknown, unknown>,
	untyped: boolean,
): unknown {
	if (Exit.isSuccess(exit)) {
		return exit.value;
	}
	const routed = untyped ? undefined : route(boundary, exit.cause);
	if (routed?.kind === "caught") {
		throw new Escalation(routed.boundary, routed.error, exit.cause);
	}
	if (routed?.kind === "uncaught") {
		return unhandledOf(exit, routed.error);
	}
	throw new Escalation(rootOf(boundary), undefined, exit.cause);
}

function useRead(
	boundary: Impl,
	factory: QueryFactory,
	handle: QueryHandle,
	options: UseQueryOptions | undefined,
): unknown {
	useMounted(boundary);
	const observed = useObservedQuery(factory, handle, options ?? {});
	const exit = use(
		QueryObserver.trackThenable(
			observed.observer,
			exitThenable(observed.result.promise),
		),
	);
	return settle(
		boundary,
		exit,
		Query.returnsEffectUnsafe(observed.query) === false,
	);
}

const never = new Promise<never>(() => {});

function useRunThrough(boundary: Impl) {
	useMounted(boundary);
	const client = useQueryClient();
	const [escalation, setEscalation] = useState<Escalation>();
	const run = useMemo(
		() => (effect: Effect.Effect<unknown, unknown>) =>
			client.runPromise(Effect.exit(effect)).then((exit) => {
				try {
					return settle(boundary, exit, false);
				} catch (error) {
					if (!isEscalation(error)) {
						throw error;
					}
					// Thrown from the next render, so the boundary that catches it gets it.
					setEscalation(error);
					return never;
				}
			}),
		[boundary, client],
	);
	if (escalation !== undefined) {
		throw escalation;
	}
	return run;
}

function Mount(props: {
	readonly boundary: Impl;
	readonly children?: ReactNode;
}) {
	const above = use(MountedContext);
	const boundary = props.boundary;
	const value = useMemo(
		(): Mounted => ({
			boundaries: new Set<Link>([...(above?.boundaries ?? []), boundary]),
		}),
		[above, boundary],
	);
	return <MountedContext value={value}>{props.children}</MountedContext>;
}

/** The root's client: its own, or the provider's above it. */
function RootClient(props: {
	readonly boundary: Impl;
	readonly children?: ReactNode;
}) {
	const boundary = props.boundary;
	const above = useOptionalQueryClient();
	if (boundary.client !== undefined) {
		return (
			<QueryClientProvider client={boundary.client}>
				{props.children}
			</QueryClientProvider>
		);
	}
	if (above === null) {
		throw new Error(
			`Boundary "${boundary.displayName}": <${boundary.displayName}> needs a QueryClientProvider above it, or a \`client\` option.`,
		);
	}
	return props.children;
}

const typeOnly = (): never => {
	throw new Error("Boundary: type-only member");
};

function make(options: {
	readonly client: QueryClient<unknown> | undefined;
	readonly fallback: (props: FallbackProps<unknown>) => ReactNode;
	readonly name: string;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => ReactNode;
	readonly tags: ReadonlyArray<string>;
}): readonly [
	Impl,
	(
		factory: QueryFactory,
		handle: QueryHandle,
		options?: UseQueryOptions,
	) => unknown,
] {
	const parent = options.parent;
	function BoundaryProvider(props: { readonly children?: ReactNode }) {
		const above = use(MountedContext);
		const contextClient = useOptionalQueryClient();
		if (
			parent !== undefined &&
			(above === undefined || !above.boundaries.has(parent))
		) {
			throw new Error(
				`Boundary "${options.name}": <${options.name}> needs <${parent.displayName}> above it.`,
			);
		}
		const client = options.client ?? contextClient;
		const mounted = <Mount boundary={self}>{props.children}</Mount>;
		return (
			<Catcher boundary={self} client={client}>
				{parent === undefined ? (
					<RootClient boundary={self}>{mounted}</RootClient>
				) : (
					mounted
				)}
			</Catcher>
		);
	}
	const self: Impl = Object.assign(BoundaryProvider, {
		client: options.client,
		displayName: options.name,
		fallback: options.fallback,
		parent,
		rootFallback: options.rootFallback,
		tags: new Set(options.tags),
		[TypeId]: { handled: typeOnly, services: typeOnly, universe: typeOnly },
	});
	const useBoundary = (
		factory: QueryFactory,
		handle: QueryHandle,
		readOptions?: UseQueryOptions,
	) => useRead(self, factory, handle, readOptions);
	return [self, useBoundary];
}

function implOf(boundary: AnyBoundary): Impl {
	// SAFETY: every boundary is made by `make`.
	return boundary as Impl;
}

/**
 * The outermost boundary. It catches what no typed boundary can: defects,
 * interrupts, failures of a `queryFn` with no typed error, and anything
 * else thrown while rendering. With `client`, it provides that client;
 * without, it needs a `QueryClientProvider` above it, and its services `R`
 * are the first type argument. `errors` (or the second type argument)
 * declares, as a type, the errors the boundaries under it can catch.
 */
export function root<R = never, U = never>(
	options: RootOptions<R, U>,
): readonly [Boundary<U, never, R>, UseBoundary<U, never>] {
	// SAFETY: a client's services are only read through the types.
	const client = options.client as QueryClient<unknown> | undefined;
	// SAFETY: `Boundary` and `UseBoundary` type what `make` erases: `settle`
	// hands back only the failures no boundary in the chain catches, and the
	// client (given, or the one above it) provides `R`.
	return make({
		client,
		fallback: () => null,
		name: options.name,
		parent: undefined,
		rootFallback: options.fallback,
		tags: [],
	}) as unknown as readonly [Boundary<U, never, R>, UseBoundary<U, never>];
}

/**
 * A boundary inside `parent` that also catches the errors tagged `tags`:
 * `Effect.catchTags` for the subtree it wraps. Each tag must be one of the
 * universe's, carried by one type only, and not caught by a boundary above.
 */
export function catchErrors<
	P extends AnyBoundary,
	const T extends Catchable<P>,
>(
	parent: P,
	options: CatchOptions<P, T>,
): readonly [
	Boundary<UniverseOf<P>, HandledBy<P> | T[number], ServicesOfBoundary<P>>,
	UseBoundary<UniverseOf<P>, HandledBy<P> | T[number]>,
] {
	// SAFETY: the Catcher only renders it with an error carrying one of `tags`.
	const fallback = options.fallback as Impl["fallback"];
	// SAFETY: see `root`.
	return make({
		client: undefined,
		fallback,
		name: options.name,
		parent: implOf(parent),
		rootFallback: () => null,
		tags: options.tags,
	}) as unknown as readonly [
		Boundary<UniverseOf<P>, HandledBy<P> | T[number], ServicesOfBoundary<P>>,
		UseBoundary<UniverseOf<P>, HandledBy<P> | T[number]>,
	];
}

/**
 * A function that runs Effects (mutations) through `boundary`, which must be
 * mounted above, with the client's services. Errors a boundary in the chain
 * catches go there, and the promise never settles; the rest come back as an
 * `Unhandled`, as a read's do.
 *
 * A hook that takes the boundary, rather than a member of the boundary's
 * hook: React Compiler treats a property of a `use…` function as a hook used
 * as a value.
 */
export function useRun<U, Handled extends string, R>(
	boundary: Boundary<U, Handled, R>,
): Run<U, Handled, R> {
	// SAFETY: see `root`; the Effect's types were checked by `Run`'s signature.
	return useRunThrough(implOf(boundary)) as unknown as Run<U, Handled, R>;
}
