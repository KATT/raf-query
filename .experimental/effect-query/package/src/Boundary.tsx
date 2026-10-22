/**
 * Typed error boundaries. A chain of boundaries reads like an Effect pipeline
 * laid over the component tree: the root is `Effect.provide` (it mounts the
 * client, and catches defects), and each boundary below it is
 * `Effect.catchTags` for the subtree it wraps.
 *
 * Boundaries name the errors they catch by `_tag`, checked against the errors
 * the root declares as a type, so the modules that declare boundaries and
 * read through them import errors with `import type` only.
 *
 * Each boundary is a pair: the Provider, which is also the boundary's
 * handle, and the hook that reads through it.
 *
 * ```tsx
 * type AppError = Boundary.RpcErrors<typeof DocRpcs>;
 * const [App, useApp] = Boundary.root({ name: "App", client, errors: Boundary.errors<AppError>(), fallback: Crashed });
 * const [Session, useSession] = Boundary.catchErrors(App, { name: "Session", tags: ["Unauthorized"], fallback: SignIn });
 *
 * // Under <App><Session>:
 * const docs = useSession(docList); // DocSummary[]: nothing left
 * const doc = useSession(docQuery(id)); // Doc | Unhandled<Forbidden | DocNotFound | RpcClientError>
 * const run = Boundary.useRun(Session); // runs mutations: Promise<A | Unhandled<what's left>>
 * ```
 *
 * The types come from the boundary a component reads through, so they are only
 * true if it is mounted above: every hook checks, and throws if it isn't.
 */
import { Cause, Context, Exit, Predicate, Result } from "effect";
import * as React from "react";

import type * as Mutation from "./Mutation.ts";
import type * as Query from "./Query.ts";
import * as QueryCache from "./QueryCache.ts";
import * as QueryClient from "./QueryClient.ts";
import { catches, type Link, rootOf, route } from "./route.ts";
import type {
	Catchable,
	Errors,
	Left,
	MatchesUniverse,
	TagChecks,
	WithTag,
} from "./tags.ts";

export { errors } from "./tags.ts";
export type {
	Catchable,
	Errors,
	Left,
	MatchesUniverse,
	NoUniverse,
	NotYetHandled,
	RpcErrors,
	SharedTags,
	TagChecks,
	TagsOf,
	WithTag,
} from "./tags.ts";

export const TypeId = "~@raf-query/experimental-effect-query/Boundary";

export type TypeId = typeof TypeId;

export interface FallbackProps<E> {
	readonly error: E;
	/** Refetches the failed queries this boundary catches, and renders its children again. */
	readonly retry: () => void;
}

export interface RootFallbackProps {
	/** Why it failed: a defect, an interrupt, or anything else thrown while rendering. */
	readonly cause: Cause.Cause<unknown>;
	/** Refetches every failed query, and renders the app again. */
	readonly retry: () => void;
}

const UnhandledTypeId = "~@raf-query/experimental-effect-query/Unhandled";

/** A failure no boundary in the chain catches, handed back to the component that read it. */
export interface Unhandled<E> {
	readonly cause: Cause.Cause<E>;
	readonly error: E;
	readonly [UnhandledTypeId]: typeof UnhandledTypeId;
}

export const isUnhandled = <A, E>(
	value: A | Unhandled<E>,
): value is Unhandled<E> => Predicate.hasProperty(value, UnhandledTypeId);

/**
 * What a read gives back: the data when the chain catches every error the
 * query can fail with, or else the data or what's left, as an `Unhandled`.
 */
export type Read<A, E> = [E] extends [never] ? A : A | Unhandled<E>;

export interface CatchOptions<
	U,
	Handled extends string,
	T extends ReadonlyArray<string>,
> {
	/**
	 * Rendered instead of the children while a caught failure stands. A
	 * component, so it can use hooks. Its `error` is the root's errors with
	 * these tags.
	 */
	readonly fallback: (
		props: FallbackProps<Extract<U, WithTag<T[number]>>>,
	) => React.ReactNode;
	/** For error messages, the event log and React DevTools. */
	readonly name: string;
	/** The `_tag`s this boundary catches: tags of the root's errors that no boundary above catches. */
	readonly tags: T & TagChecks<U, Handled, T[number]>;
}

export interface ProviderProps {
	readonly children?: React.ReactNode;
}

/** What every boundary is, whatever it handles: a Provider component. */
export interface AnyBoundary {
	(props: ProviderProps): React.ReactNode;
	/** The boundary's `name`, for React DevTools. */
	readonly displayName: string;
	readonly [TypeId]: unknown;
}

/**
 * A boundary: the component that mounts it, typed with the root's errors
 * (`U`), the tags it and the ones above it catch, and the services its
 * queries may use. Its parent must be mounted above it.
 */
export interface Boundary<U, Handled extends string, R> extends AnyBoundary {
	readonly [TypeId]: {
		readonly _Handled: (_: Handled) => Handled;
		readonly _R: (_: R) => R;
		readonly _U: (_: U) => U;
	};
}

/** The errors a boundary's root declares. */
export type UniverseOf<B> =
	B extends Boundary<infer U, infer _Handled, infer _R> ? U : never;

/** The tags a boundary and the ones above it catch. */
export type HandledBy<B> =
	B extends Boundary<infer _U, infer Handled extends string, infer _R>
		? Handled
		: never;

/** The services a boundary's queries may use: its root client's. */
export type ServicesOf<B> =
	B extends Boundary<infer _U, infer _Handled, infer R> ? R : never;

/** Element 1 of `root` and `catchErrors`: reads queries through the boundary. */
export interface Hook<U, Handled extends string, R> {
	/**
	 * Reads a query, suspending until its first result. Errors a boundary in
	 * the chain catches go there; the rest come back as an `Unhandled`. When
	 * the chain catches them all, it returns the data.
	 */
	<A, E, Q extends R>(
		query: Query.Query<A, E, Q> & MatchesUniverse<E, Handled, U>,
	): Read<A, Left<E, Handled>>;
}

/** What `useRun` returns: runs a mutation through the boundary. */
export type Run<U, Handled extends string, R> = <A, E, Q extends R>(
	mutation: Mutation.Mutation<A, E, Q> & MatchesUniverse<E, Handled, U>,
) => Promise<Read<A, Left<E, Handled>>>;

/** What `root` and `catchErrors` return: the Provider, and its hook. */
export type Pair<B> = readonly [
	B,
	Hook<UniverseOf<B>, HandledBy<B>, ServicesOf<B>>,
];

/** The boundary `catchErrors(parent, { tags })` makes. */
export type Inner<P, T extends ReadonlyArray<string>> = Boundary<
	UniverseOf<P>,
	HandledBy<P> | T[number],
	ServicesOf<P>
>;

export const isBoundary = (u: unknown): u is AnyBoundary =>
	Predicate.hasProperty(u, TypeId);

export interface Caught {
	/** The boundary that renders its fallback for it. */
	readonly boundary: AnyBoundary;
	readonly cause: Cause.Cause<unknown>;
	/** The typed failure, or `undefined` when the root caught a defect or an interrupt. */
	readonly error: unknown;
	/** The boundary's `name`. */
	readonly name: string;
	/** Whether the root caught it. */
	readonly root: boolean;
}

interface Impl extends Link {
	readonly client: QueryClient.Any | undefined;
	readonly fallback: (props: FallbackProps<unknown>) => React.ReactNode;
	readonly onCaught: ((caught: Caught) => void) | undefined;
	readonly parent: Impl | undefined;
	readonly Provider: AnyBoundary;
	readonly rootFallback: (props: RootFallbackProps) => React.ReactNode;
}

const impls = new WeakMap<AnyBoundary, Impl>();

const implOf = (boundary: AnyBoundary): Impl => {
	const impl = impls.get(boundary);
	if (impl === undefined) {
		throw new Error("Not a boundary: make one with Boundary.root.");
	}
	return impl;
};

interface Mounted {
	readonly boundaries: ReadonlySet<Impl>;
	readonly cache: QueryCache.QueryCache;
	readonly client: QueryClient.Any;
	readonly services: Context.Context<never>;
}

const MountedContext = React.createContext<Mounted | undefined>(undefined);

const EscalationTypeId = "~@raf-query/experimental-effect-query/Escalation";

/** What a hook throws to send a failure to a boundary above it. */
class Escalation extends Error {
	readonly [EscalationTypeId] = EscalationTypeId;
	readonly boundary: Impl;
	readonly error: unknown;
	readonly cause: Cause.Cause<unknown>;
	constructor(boundary: Impl, error: unknown, cause: Cause.Cause<unknown>) {
		super(`${boundary.name} caught: ${Cause.pretty(cause)}`);
		this.name = "Escalation";
		this.boundary = boundary;
		this.error = error;
		this.cause = cause;
	}
}

const isOwn = (u: unknown): u is Escalation =>
	Predicate.hasProperty(u, EscalationTypeId);

const caughtOf = (
	boundary: Impl,
	error: unknown,
	cause: Cause.Cause<unknown>,
): Caught => ({
	boundary: boundary.Provider,
	cause,
	error,
	name: boundary.name,
	root: boundary.parent === undefined,
});

/**
 * For `createRoot`'s `onCaughtError`: which boundary caught `u`, and why, when
 * `u` is a failure a hook sent to a boundary. `undefined` for anything else
 * React caught, such as an error thrown while rendering.
 */
export const caughtBy = (u: unknown): Caught | undefined =>
	isOwn(u) ? caughtOf(u.boundary, u.error, u.cause) : undefined;

/** Whether `boundary`'s `retry` refetches this failure: one it catches, or any for the root. */
const retries = (boundary: Impl, cause: Cause.Cause<unknown>): boolean => {
	if (boundary.parent === undefined) {
		return true;
	}
	const found = Cause.findError(cause);
	return Result.isSuccess(found) && catches(boundary, found.success);
};

const cacheOf = (boundary: Impl, above: Mounted | undefined) => {
	if (above !== undefined) {
		return above.cache;
	}
	const client = rootOf(boundary).client;
	const exit = client?.runtime.runSyncExit(QueryCache.QueryCache);
	return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined;
};

interface CatcherProps {
	readonly above: Mounted | undefined;
	readonly boundary: Impl;
	readonly children?: React.ReactNode;
}

interface CatcherState {
	readonly caught: { readonly value: unknown } | undefined;
}

class Catcher extends React.Component<CatcherProps, CatcherState> {
	override state: CatcherState = { caught: undefined };

	static getDerivedStateFromError(value: unknown): CatcherState {
		return { caught: { value } };
	}

	/** Only the boundary whose fallback rendered reports: the others threw it on. */
	override componentDidCatch(value: unknown) {
		const boundary = this.props.boundary;
		const onCaught = rootOf(boundary).onCaught;
		if (onCaught === undefined) {
			return;
		}
		if (boundary.parent === undefined) {
			onCaught(
				isOwn(value)
					? caughtOf(boundary, value.error, value.cause)
					: caughtOf(boundary, undefined, Cause.die(value)),
			);
		} else if (isOwn(value) && value.boundary === boundary) {
			onCaught(caughtOf(boundary, value.error, value.cause));
		}
	}

	retry = () => {
		const boundary = this.props.boundary;
		cacheOf(boundary, this.props.above)?.retryUnsafe((cause) =>
			retries(boundary, cause),
		);
		this.setState({ caught: undefined });
	};

	override render() {
		const boundary = this.props.boundary;
		if (this.state.caught === undefined) {
			return this.props.children;
		}
		const value = this.state.caught.value;
		if (boundary.parent === undefined) {
			return React.createElement(boundary.rootFallback, {
				cause: isOwn(value) ? value.cause : Cause.die(value),
				retry: this.retry,
			});
		}
		if (isOwn(value) && value.boundary === boundary) {
			return React.createElement(boundary.fallback, {
				error: value.error,
				retry: this.retry,
			});
		}
		// Not ours: a boundary further up takes it.
		throw value;
	}
}

const useMounted = (boundary: Impl, hook: string): Mounted => {
	const mounted = React.useContext(MountedContext);
	if (mounted === undefined || !mounted.boundaries.has(boundary)) {
		throw new Error(
			`${boundary.name}'s ${hook} needs <${boundary.name}> above it.`,
		);
	}
	return mounted;
};

const never = new Promise<never>(() => {});

/** The data, the failure to hand back, or a throw to the boundary that catches it. */
const settle = (boundary: Impl, exit: Exit.Exit<unknown, unknown>) => {
	if (Exit.isSuccess(exit)) {
		return exit.value;
	}
	const routed = route(boundary, exit.cause);
	if (routed.kind === "caught") {
		throw new Escalation(routed.boundary, routed.error, exit.cause);
	}
	if (routed.kind === "uncaught") {
		return {
			cause: exit.cause,
			error: routed.error,
			[UnhandledTypeId]: UnhandledTypeId,
		} satisfies Unhandled<unknown>;
	}
	throw new Escalation(rootOf(boundary), undefined, exit.cause);
};

/** The hook's query, with its types erased: `Hook`'s signature checked them. */
type Erased = Query.Query<unknown, unknown, never>;

const useRead = (boundary: Impl, query: Erased): unknown => {
	const mounted = useMounted(boundary, "hook");
	const cache = mounted.cache;
	// By hash: a query is a value, and two with the same hash are the same query.
	const subscribe = React.useCallback(
		(listener: () => void) => cache.subscribeUnsafe(query.hash, listener),
		[cache, query.hash],
	);
	const getSnapshot = () => cache.readUnsafe(query, mounted.services);
	let snapshot = React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot,
	);
	React.use(snapshot.promise);
	// Settled without a result: the entry was dropped, and reading made a new one.
	while (snapshot.exit === undefined) {
		snapshot = getSnapshot();
		React.use(snapshot.promise);
	}
	return settle(boundary, snapshot.exit);
};

const useRunImpl = (boundary: Impl) => {
	const client = useMounted(boundary, "useRun()").client;
	const [escalation, setEscalation] = React.useState<Escalation>();
	const run = React.useCallback(
		(mutation: Mutation.Mutation<unknown, unknown, never>) =>
			client.runtime.runPromiseExit(mutation.effect).then((exit) => {
				try {
					return settle(boundary, exit);
				} catch (error) {
					if (!isOwn(error)) {
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
};

const Mount = (props: {
	readonly above: Mounted | undefined;
	readonly boundary: Impl;
	readonly children?: React.ReactNode;
}) => {
	const { above } = props;
	const boundary = props.boundary;
	const value = React.useMemo(
		() =>
			above === undefined
				? undefined
				: { ...above, boundaries: new Set([...above.boundaries, boundary]) },
		[above, boundary],
	);
	return <MountedContext value={value}>{props.children}</MountedContext>;
};

const MountClient = (props: {
	readonly boundary: Impl;
	readonly children?: React.ReactNode;
	readonly client: QueryClient.Any;
}) => {
	const { boundary, client } = props;
	const exit = React.use(QueryClient.contextExitUnsafe(client));
	if (Exit.isFailure(exit)) {
		throw new Escalation(boundary, undefined, exit.cause);
	}
	const services = exit.value;
	const value = React.useMemo(
		() => ({
			boundaries: new Set([boundary]),
			cache: Context.get(services, QueryCache.QueryCache),
			client,
			services,
		}),
		[boundary, client, services],
	);
	return <MountedContext value={value}>{props.children}</MountedContext>;
};

const variance = {
	_Handled: (_: unknown) => _,
	_R: (_: unknown) => _,
	_U: (_: unknown) => _,
};

const make = (options: {
	readonly client: QueryClient.Any | undefined;
	readonly fallback: (props: FallbackProps<unknown>) => React.ReactNode;
	readonly name: string;
	readonly onCaught: ((caught: Caught) => void) | undefined;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => React.ReactNode;
	readonly tags: ReadonlySet<string>;
}) => {
	const Provider = (props: ProviderProps) => {
		const above = React.useContext(MountedContext);
		const { parent } = self;
		if (
			parent !== undefined &&
			(above === undefined || !above.boundaries.has(parent))
		) {
			throw new Error(`<${self.name}> needs <${parent.name}> above it.`);
		}
		return (
			<Catcher above={above} boundary={self}>
				{self.client === undefined ? (
					<Mount above={above} boundary={self}>
						{props.children}
					</Mount>
				) : (
					<MountClient boundary={self} client={self.client}>
						{props.children}
					</MountClient>
				)}
			</Catcher>
		);
	};
	Provider.displayName = options.name;
	const boundary = Object.assign(Provider, { [TypeId]: variance });
	const self: Impl = { ...options, Provider: boundary };
	impls.set(boundary, self);

	const useBoundary = (query: Erased) => useRead(self, query);
	return [boundary, useBoundary] as const;
};

/**
 * The outermost boundary. It mounts `client` (and suspends until its layer is
 * built) and catches what no typed boundary can: defects, interrupts, a layer
 * that failed to build, and anything else thrown while rendering.
 *
 * `errors` declares, as a type, the errors the boundaries below may catch:
 * `Boundary.errors<Boundary.RpcErrors<typeof Rpcs>>()` for an RPC client's.
 */
export const root = <R, ER, U = never>(options: {
	readonly client: QueryClient.QueryClient<R, ER>;
	readonly errors?: Errors<U> | undefined;
	readonly fallback: (props: RootFallbackProps) => React.ReactNode;
	readonly name: string;
	/** Called once for each failure a boundary of this chain renders its fallback for. */
	readonly onCaught?: ((caught: Caught) => void) | undefined;
}): Pair<Boundary<U, never, R | QueryCache.QueryCache>> =>
	// SAFETY: the pair is typed by `Pair`; at runtime the hook is
	// type-erased, the root catches nothing typed, and its client provides `R`.
	make({
		client: options.client,
		fallback: () => null,
		name: options.name,
		onCaught: options.onCaught,
		parent: undefined,
		rootFallback: options.fallback,
		tags: new Set(),
	}) as unknown as Pair<Boundary<U, never, R | QueryCache.QueryCache>>;

/** A boundary inside `parent` that also catches the errors with `tags`. Mount it under `parent`. */
export const catchErrors = <
	P extends AnyBoundary,
	const T extends Catchable<UniverseOf<P>>,
>(
	parent: P,
	options: CatchOptions<UniverseOf<P>, HandledBy<P>, T>,
): Pair<Inner<P, T>> => {
	const above = implOf(parent);
	// SAFETY: the Catcher only renders it with an error whose tag is one of `tags`.
	const fallback = options.fallback as Impl["fallback"];
	// SAFETY: see `root`; `settle` only hands back failures no boundary in the chain catches.
	return make({
		client: undefined,
		fallback,
		name: options.name,
		onCaught: undefined,
		parent: above,
		rootFallback: above.rootFallback,
		tags: new Set(options.tags),
	}) as unknown as Pair<Inner<P, T>>;
};

/**
 * A function that runs a mutation with the client's services, through
 * `boundary`, which must be mounted above. Errors a boundary in its chain
 * catches go there, and the promise never settles; the rest come back as an
 * `Unhandled`, as a read's do, handled where the mutation was run.
 *
 * A hook of its own, rather than a method of the boundary's hook: the React
 * Compiler treats any property of a `use…` function as a hook used as a
 * value.
 */
export const useRun = <U, Handled extends string, R>(
	boundary: Boundary<U, Handled, R>,
): Run<U, Handled, R> =>
	// SAFETY: the mutation's types were checked by `Run`; at runtime it is type-erased.
	useRunImpl(implOf(boundary)) as unknown as Run<U, Handled, R>;
