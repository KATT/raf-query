"use client";

/**
 * Typed error boundaries for queries whose `queryFn` returns an Effect. A
 * chain of boundaries reads like an Effect pipeline laid over the component
 * tree: the root catches defects and interrupts, and each boundary below it
 * is `Effect.catchTags` for the subtree it wraps.
 *
 * ```tsx
 * const [App, useApp] = Boundary.root({ name: "App", fallback: Crashed });
 * const [Session, useSession] = Boundary.catchErrors(App, {
 *   name: "Session",
 *   errors: [Unauthorized],
 *   fallback: SignIn,
 * });
 *
 * // Under <App><Session>:
 * const docs = useSession(docListQuery, handle); // the data: nothing is left
 * const doc = Session.useResult(docQuery, handle); // Result<Doc, DocNotFound>
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
import { Cause, Effect, Exit, Predicate, Result } from "effect";
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
import {
	type Catchable,
	type Link,
	rootOf,
	route,
	type TagsOf,
} from "./route.ts";

export type { Catchable } from "./route.ts";

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
	/** Why it failed: a defect, an interrupt, or a typed failure nothing caught. */
	readonly cause: Cause.Cause<unknown>;
	/** Renders the app again; failed first loads start over as they are read. */
	readonly retry: () => void;
}

/**
 * The hook's `handle` (or `run`'s Effect) type when the error type isn't all
 * handled: a property that names the tags left, so the type error says
 * which ones.
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
	readonly fallback: (props: FallbackProps<S[number]["Type"]>) => ReactNode;
	/** The boundary's name, for error messages, `caughtBy` and React DevTools. */
	readonly name: string;
}

export interface RootOptions<R> {
	/**
	 * A client to provide to the tree. Without one, the root reads the
	 * nearest `QueryClientProvider`'s (or `QueryProvider`'s) and its services
	 * are the root's type argument.
	 */
	readonly client?: QueryClient<R>;
	/** Rendered instead of the app while a defect, an interrupt or an uncaught failure stands. */
	readonly fallback: (props: RootFallbackProps) => ReactNode;
	/** The boundary's name, for error messages, `caughtBy` and React DevTools. */
	readonly name: string;
}

/** What every boundary is, whatever it handles. */
export interface AnyBoundary extends Link {
	/** Renders the boundary around `children`. Its parent must be above it. */
	(props: { readonly children?: ReactNode }): ReactNode;
	readonly parent: AnyBoundary | undefined;
	readonly [TypeId]: {
		readonly handled: (_: never) => unknown;
		readonly services: (_: never) => unknown;
	};
}

/**
 * A boundary: the component that renders it, and the handle
 * {@link catchErrors} takes to nest another inside it. `Handled` is what it
 * and the boundaries above it catch; `R` the services its client provides.
 */
export interface Boundary<Handled, R> extends AnyBoundary {
	readonly [TypeId]: {
		readonly handled: (_: never) => Handled;
		readonly services: (_: never) => R;
	};
	/**
	 * Reads the query a handle points at. Errors a boundary in the chain
	 * catches go there; the rest come back as the `Result`'s failure.
	 * Suspends until the query's first result.
	 */
	useResult<TFactory extends QueryFactory>(
		factory: TFactory,
		handle: QueryHandle<TFactory>,
		options?: UseQueryOptions,
	): Result.Result<DataOf<TFactory>, Exclude<ErrorOf<TFactory>, Handled>>;
	/** A function that runs Effects with the client's services, narrowed like the reads. */
	useRun(): Run<Handled, R>;
}

/** Runs Effects (mutations) with the client's services, narrowed by the boundary. */
export interface Run<Handled, R> {
	/**
	 * Resolves with the success. Only type-checks when the boundary chain
	 * catches every error the Effect can fail with; a failure it catches goes
	 * to its boundary, and the promise never settles.
	 */
	<A, E, Q extends QueryCache.QueryCache | R>(
		effect: Effect.Effect<A, E, Q> & Exhausted<E, Handled>,
	): Promise<A>;
	/**
	 * Resolves with a `Result` whose failure is what no boundary in the chain
	 * catches. A failure one catches goes there, and the promise never settles.
	 */
	result<A, E, Q extends QueryCache.QueryCache | R>(
		effect: Effect.Effect<A, E, Q>,
	): Promise<Result.Result<A, Exclude<E, Handled>>>;
}

/** A boundary's hook. It suspends until the query's first result. */
export interface UseBoundary<Handled> {
	/**
	 * Reads the query a handle points at, and returns its data. Only
	 * type-checks when the boundary and the ones above it catch every error
	 * the query can fail with, so there is no failure to get.
	 */
	<TFactory extends QueryFactory>(
		factory: TFactory,
		handle: QueryHandle<TFactory> & Exhausted<ErrorOf<TFactory>, Handled>,
		options?: UseQueryOptions,
	): DataOf<TFactory>;
}

/** The errors a boundary and the ones above it catch. */
export type HandledBy<B> = B extends Boundary<infer H, infer _R> ? H : never;

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
	/** The typed failure, or `undefined` when the root caught a defect or an interrupt. */
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
	readonly useResult: (
		factory: QueryFactory,
		handle: QueryHandle,
		options?: UseQueryOptions,
	) => Result.Result<unknown, unknown>;
	readonly useRun: () => unknown;
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

type Settled =
	| { readonly kind: "data"; readonly value: unknown }
	| { readonly error: unknown; readonly kind: "failure" }
	| { readonly escalation: Escalation; readonly kind: "escalate" };

/**
 * The success, the failure to hand back, or the boundary that takes it. A
 * failure nothing in the chain catches goes to the root when the caller
 * can't hand it back: its types said there was none.
 */
function settle(
	boundary: Impl,
	exit: Exit.Exit<unknown, unknown>,
	returnsUncaught: boolean,
): Settled {
	if (Exit.isSuccess(exit)) {
		return { kind: "data", value: exit.value };
	}
	const routed = route(boundary, exit.cause);
	if (routed.kind === "caught") {
		return {
			escalation: new Escalation(routed.boundary, routed.error, exit.cause),
			kind: "escalate",
		};
	}
	if (routed.kind === "uncaught" && returnsUncaught) {
		return { error: routed.error, kind: "failure" };
	}
	return {
		escalation: new Escalation(rootOf(boundary), undefined, exit.cause),
		kind: "escalate",
	};
}

function useRead(
	boundary: Impl,
	factory: QueryFactory,
	handle: QueryHandle,
	options: UseQueryOptions | undefined,
	returnsUncaught: boolean,
): Exclude<Settled, { readonly kind: "escalate" }> {
	useMounted(boundary);
	const observed = useObservedQuery(factory, handle, options ?? {});
	const exit = use(
		QueryObserver.trackThenable(
			observed.observer,
			exitThenable(observed.result.promise),
		),
	);
	const settled = settle(boundary, exit, returnsUncaught);
	if (settled.kind === "escalate") {
		throw settled.escalation;
	}
	return settled;
}

const never = new Promise<never>(() => {});

function useRun(boundary: Impl) {
	useMounted(boundary);
	const client = useQueryClient();
	const [escalation, setEscalation] = useState<Escalation>();
	const run = useMemo(() => {
		const execute = (
			effect: Effect.Effect<unknown, unknown>,
			returnsUncaught: boolean,
		) =>
			client.runPromise(Effect.exit(effect)).then((exit) => {
				const settled = settle(boundary, exit, returnsUncaught);
				if (settled.kind === "escalate") {
					// Thrown from the next render, so the boundary that catches it gets it.
					setEscalation(settled.escalation);
					return never;
				}
				return settled.kind === "data"
					? returnsUncaught
						? Result.succeed(settled.value)
						: settled.value
					: Result.fail(settled.error);
			});
		return Object.assign(
			(effect: Effect.Effect<unknown, unknown>) => execute(effect, false),
			{
				result: (effect: Effect.Effect<unknown, unknown>) =>
					execute(effect, true),
			},
		);
	}, [boundary, client]);
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

function make(options: {
	readonly client: QueryClient<unknown> | undefined;
	readonly errors: ReadonlyArray<Catchable>;
	readonly fallback: (props: FallbackProps<unknown>) => ReactNode;
	readonly name: string;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => ReactNode;
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
		errors: options.errors,
		fallback: options.fallback,
		parent,
		rootFallback: options.rootFallback,
		[TypeId]: { handled: identity, services: identity },
		useResult: (
			factory: QueryFactory,
			handle: QueryHandle,
			readOptions?: UseQueryOptions,
		) => {
			const settled = useRead(self, factory, handle, readOptions, true);
			return settled.kind === "data"
				? Result.succeed(settled.value)
				: Result.fail(settled.error);
		},
		useRun: () => useRun(self),
	});
	const useBoundary = (
		factory: QueryFactory,
		handle: QueryHandle,
		readOptions?: UseQueryOptions,
	) => {
		const settled = useRead(self, factory, handle, readOptions, false);
		// `useRead` sends a failure it can't hand back to the root.
		return settled.kind === "data" ? settled.value : undefined;
	};
	return [self, useBoundary];
}

const identity = (value: never) => value;

/**
 * The outermost boundary. It catches what no typed boundary can: defects,
 * interrupts, typed failures nothing in the chain catches, and anything
 * else thrown while rendering. With `client`, it provides that client;
 * without, it needs a `QueryClientProvider` above it, and its services `R`
 * are the type argument.
 */
export function root<R = never>(
	options: RootOptions<R>,
): readonly [Boundary<never, R>, UseBoundary<never>] {
	// SAFETY: a client's services are only read through the types.
	const client = options.client as QueryClient<unknown> | undefined;
	// SAFETY: see `make`; the root catches nothing typed, and its client
	// (given, or the one above it) provides `R`.
	return make({
		client,
		errors: [],
		fallback: () => null,
		name: options.name,
		parent: undefined,
		rootFallback: options.fallback,
	}) as unknown as readonly [Boundary<never, R>, UseBoundary<never>];
}

/**
 * A boundary inside `parent` that also catches `errors`: a typed failure
 * they accept, from a hook read through it or a boundary inside it, renders
 * `fallback` in its place. `errors` can't list one `parent`'s chain already
 * catches.
 */
export function catchErrors<
	Handled,
	R,
	const S extends ReadonlyArray<Catchable>,
>(
	parent: Boundary<Handled, R>,
	options: CatchOptions<S, Handled>,
): readonly [
	Boundary<Handled | S[number]["Type"], R>,
	UseBoundary<Handled | S[number]["Type"]>,
] {
	// SAFETY: every boundary is made by `make`.
	const above = parent as unknown as Impl;
	// SAFETY: the Catcher only renders it with an error one of `errors` accepted.
	const fallback = options.fallback as Impl["fallback"];
	// SAFETY: see `make`.
	return make({
		client: undefined,
		errors: options.errors,
		fallback,
		name: options.name,
		parent: above,
		rootFallback: () => null,
	}) as unknown as readonly [
		Boundary<Handled | S[number]["Type"], R>,
		UseBoundary<Handled | S[number]["Type"]>,
	];
}
