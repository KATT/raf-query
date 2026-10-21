/**
 * Typed error boundaries. A chain of boundaries reads like an Effect pipeline
 * laid over the component tree: the root is `Effect.provide` (it mounts the
 * client, and catches defects), and each boundary below it is
 * `Effect.catchTags` for the subtree it wraps.
 *
 * ```tsx
 * const App = Boundary.root({ name: "App", client, fallback: Crashed });
 * const Auth = App.catchErrors({ name: "Auth", errors: [Unauthorized], fallback: SignIn });
 *
 * // Under <App.Provider><Auth.Provider>:
 * const result = Auth.useResult(docQuery(id)); // Result<Doc, DocNotFound>
 * ```
 *
 * The types come from the boundary a component reads through, so they are only
 * true if it is mounted above: every hook checks, and throws if it isn't.
 */
import { Cause, Context, type Effect, Exit, Predicate, Result } from "effect";
import * as React from "react";

import type * as Query from "./Query.ts";
import * as QueryCache from "./QueryCache.ts";
import * as QueryClient from "./QueryClient.ts";
import {
	type Catchable,
	catches,
	type Link,
	rootOf,
	route,
	type TagsOf,
} from "./route.ts";

export type { Catchable } from "./route.ts";

export const TypeId = "~@raf-query/experimental-effect-query/Boundary";

export type TypeId = typeof TypeId;

export interface FallbackProps<E> {
	readonly error: E;
	/** Refetches the failed queries this boundary catches, and renders its children again. */
	readonly retry: () => void;
}

export interface RootFallbackProps {
	/** Why it failed: a defect, an interrupt, or a typed failure nothing caught. */
	readonly cause: Cause.Cause<unknown>;
	/** Refetches every failed query, and renders the app again. */
	readonly retry: () => void;
}

/**
 * `use`'s argument type when the query's errors aren't all handled: a
 * property that names the tags left, so the type error says which ones.
 */
export type Exhausted<E, Handled> = [Exclude<E, Handled>] extends [never]
	? unknown
	: { readonly UnhandledErrors: TagsOf<Exclude<E, Handled>> };

/** `errors`' type when a boundary above already catches one of them. */
export type NotYetHandled<S extends ReadonlyArray<Catchable>, Handled> = [
	Extract<S[number]["Type"], Handled>,
] extends [never]
	? unknown
	: {
			readonly AlreadyHandledAbove: TagsOf<Extract<S[number]["Type"], Handled>>;
		};

export interface CatchOptions<S extends ReadonlyArray<Catchable>, Handled> {
	/** The error classes this boundary catches, such as `Schema.TaggedError`s. */
	readonly errors: S & NotYetHandled<S, Handled>;
	/** Rendered instead of the children while a caught failure stands. A component, so it can use hooks. */
	readonly fallback: (
		props: FallbackProps<S[number]["Type"]>,
	) => React.ReactNode;
	/** For error messages. */
	readonly name: string;
}

/** What every boundary is, whatever it handles: what routing and mounting need. */
export interface AnyBoundary extends Link {
	readonly parent: AnyBoundary | undefined;
	/** Mounts the boundary. Its parent's `Provider` must be above it. */
	readonly Provider: (props: {
		readonly children?: React.ReactNode;
	}) => React.ReactNode;
	readonly [TypeId]: TypeId;
}

export interface Boundary<Handled, R> extends AnyBoundary {
	/** A boundary inside this one that also catches `errors`. */
	catchErrors<const S extends ReadonlyArray<Catchable>>(
		options: CatchOptions<S, Handled>,
	): Boundary<Handled | S[number]["Type"], R>;
	/**
	 * Reads a query, suspending until its first result. Only type-checks when
	 * this boundary and the ones above it catch every error the query can fail
	 * with, so it always returns the data.
	 */
	use<A, E, Q extends R>(
		query: Query.Query<A, E, Q> & Exhausted<E, Handled>,
	): A;
	/**
	 * Reads a query, suspending until its first result. Errors a boundary above
	 * catches go there; the rest come back as the `Result`'s failure.
	 */
	useResult<A, E, Q extends R>(
		query: Query.Query<A, E, Q>,
	): Result.Result<A, Exclude<E, Handled>>;
	/**
	 * A function that runs an Effect (a mutation, say) with the client's
	 * services. Errors a boundary above catches go there, and the promise never
	 * settles; the rest come back as the `Result`'s failure.
	 */
	useRun(): <A, E, Q extends R>(
		effect: Effect.Effect<A, E, Q>,
	) => Promise<Result.Result<A, Exclude<E, Handled>>>;
}

/** The errors a boundary and the ones above it catch. */
export type HandledBy<B> = B extends Boundary<infer H, infer _R> ? H : never;

export const isBoundary = (u: unknown): u is AnyBoundary =>
	Predicate.hasProperty(u, TypeId);

interface Mounted {
	readonly boundaries: ReadonlySet<AnyBoundary>;
	readonly cache: QueryCache.QueryCache;
	readonly client: QueryClient.Any;
	readonly services: Context.Context<never>;
}

const MountedContext = React.createContext<Mounted | undefined>(undefined);

const EscalationTypeId = "~@raf-query/experimental-effect-query/Escalation";

/** What a hook throws to send a failure to a boundary above it. */
class Escalation extends Error {
	readonly [EscalationTypeId] = EscalationTypeId;
	readonly boundary: AnyBoundary;
	readonly error: unknown;
	readonly cause: Cause.Cause<unknown>;
	constructor(
		boundary: AnyBoundary,
		error: unknown,
		cause: Cause.Cause<unknown>,
	) {
		super(`${boundary.name} caught: ${Cause.pretty(cause)}`);
		this.name = "Escalation";
		this.boundary = boundary;
		this.error = error;
		this.cause = cause;
	}
}

const isOwn = (u: unknown): u is Escalation =>
	Predicate.hasProperty(u, EscalationTypeId);

export interface Caught {
	/** The boundary that renders its fallback for it. */
	readonly boundary: AnyBoundary;
	readonly cause: Cause.Cause<unknown>;
	/** The typed failure, or `undefined` when the root caught a defect or an interrupt. */
	readonly error: unknown;
}

/**
 * For `createRoot`'s `onCaughtError`: which boundary caught `u`, and why, when
 * `u` is a failure a hook sent to a boundary. `undefined` for anything else
 * React caught, such as an error thrown while rendering.
 */
export const caughtBy = (u: unknown): Caught | undefined =>
	isOwn(u)
		? { boundary: u.boundary, cause: u.cause, error: u.error }
		: undefined;

interface Impl extends AnyBoundary {
	readonly client: QueryClient.Any | undefined;
	readonly fallback: (props: FallbackProps<unknown>) => React.ReactNode;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => React.ReactNode;
}

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

const useMounted = (boundary: AnyBoundary, hook: string): Mounted => {
	const mounted = React.useContext(MountedContext);
	if (mounted === undefined || !mounted.boundaries.has(boundary)) {
		throw new Error(
			`${boundary.name}.${hook}() needs <${boundary.name}.Provider> above it.`,
		);
	}
	return mounted;
};

const never = new Promise<never>(() => {});

/** The success, the failure to hand back, or a throw to the boundary that catches it. */
const settle = (
	boundary: Impl,
	exit: Exit.Exit<unknown, unknown>,
	returnsUncaught: boolean,
): Result.Result<unknown, unknown> => {
	if (Exit.isSuccess(exit)) {
		return Result.succeed(exit.value);
	}
	const routed = route(boundary, exit.cause);
	if (routed.kind === "caught") {
		throw new Escalation(routed.boundary, routed.error, exit.cause);
	}
	if (routed.kind === "uncaught" && returnsUncaught) {
		return Result.fail(routed.error);
	}
	throw new Escalation(rootOf(boundary), undefined, exit.cause);
};

/** The hooks' query, with its types erased: `Boundary`'s signatures checked them. */
type Erased = Query.Query<unknown, unknown, never>;

const useRead = (
	boundary: Impl,
	hook: "use" | "useResult",
	query: Erased,
): Result.Result<unknown, unknown> => {
	const mounted = useMounted(boundary, hook);
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
	return settle(boundary, snapshot.exit, hook === "useResult");
};

const useRun = (boundary: Impl) => {
	const client = useMounted(boundary, "useRun").client;
	const [escalation, setEscalation] = React.useState<Escalation>();
	const run = React.useCallback(
		(effect: Effect.Effect<unknown, unknown, never>) =>
			client.runtime.runPromiseExit(effect).then((exit) => {
				try {
					return settle(boundary, exit, true);
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
	readonly boundary: AnyBoundary;
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
	readonly boundary: AnyBoundary;
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

const make = (options: {
	readonly client: QueryClient.Any | undefined;
	readonly errors: ReadonlyArray<Catchable>;
	readonly fallback: (props: FallbackProps<unknown>) => React.ReactNode;
	readonly name: string;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => React.ReactNode;
}): Impl => {
	const Provider = (props: { readonly children?: React.ReactNode }) => {
		const above = React.useContext(MountedContext);
		const { parent } = self;
		if (
			parent !== undefined &&
			(above === undefined || !above.boundaries.has(parent))
		) {
			throw new Error(
				`<${self.name}.Provider> needs <${parent.name}.Provider> above it.`,
			);
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

	const catchErrors = (
		catchOptions: CatchOptions<ReadonlyArray<Catchable>, unknown>,
	) => {
		// SAFETY: the Catcher only renders it with an error one of `errors` accepted.
		const fallback = catchOptions.fallback as Impl["fallback"];
		return make({
			client: undefined,
			errors: catchOptions.errors,
			fallback,
			name: catchOptions.name,
			parent: self,
			rootFallback: options.rootFallback,
		});
	};

	// SAFETY: the hooks are typed by `Boundary`; at runtime they are type-erased,
	// and `settle` only hands back failures no boundary in the chain catches.
	const self = {
		catchErrors,
		client: options.client,
		errors: options.errors,
		fallback: options.fallback,
		name: options.name,
		parent: options.parent,
		Provider,
		rootFallback: options.rootFallback,
		[TypeId]: TypeId,
		use: (query: Erased) => Result.getOrThrow(useRead(self, "use", query)),
		useResult: (query: Erased) => useRead(self, "useResult", query),
		useRun: () => useRun(self),
	} as unknown as Impl;
	return self;
};

/**
 * The outermost boundary. It mounts `client` (and suspends until its layer is
 * built) and catches what no typed boundary can: defects, interrupts, a layer
 * that failed to build, and anything else thrown while rendering.
 */
export const root = <R, ER>(options: {
	readonly client: QueryClient.QueryClient<R, ER>;
	readonly fallback: (props: RootFallbackProps) => React.ReactNode;
	readonly name: string;
}): Boundary<never, R | QueryCache.QueryCache> =>
	// SAFETY: see `make`; the root catches nothing typed, and its client provides `R`.
	make({
		client: options.client,
		errors: [],
		fallback: () => null,
		name: options.name,
		parent: undefined,
		rootFallback: options.fallback,
	}) as unknown as Boundary<never, R | QueryCache.QueryCache>;
