/**
 * Typed error boundaries over `effect/reactivity` atoms. A chain of boundaries
 * reads like an Effect pipeline laid over the component tree: each boundary is
 * `Effect.catchTags` for the subtree it wraps, and the root catches what no
 * typed boundary can (defects and interrupts). Atoms carry their own runtime,
 * so the chain needs no client: mount it under `@effect/atom-react`'s
 * `RegistryProvider`.
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
 * const doc = useSession(DocsClient.query("GetDoc", { id })); // Doc | Unhandled<Forbidden | DocNotFound>
 * ```
 *
 * The types come from the boundary a component reads through, so they are only
 * true if it is mounted above: every hook checks, and throws if it isn't.
 */
import {
	RegistryContext,
	useAtomMount,
	useAtomValue,
} from "@effect/atom-react";
import { Cause, Effect, Exit, Option, Predicate, Result } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import * as React from "react";

import {
	type Catchable,
	catches,
	type Link,
	rootOf,
	route,
	type TagsOf,
} from "./route.ts";

export type { Catchable } from "./route.ts";

export const TypeId = "~@raf-query/experimental-effect-atom/Boundary";

export type TypeId = typeof TypeId;

export interface FallbackProps<E> {
	readonly error: E;
	/** Refreshes the failed atoms this boundary catches, and renders its children again. */
	readonly retry: () => void;
}

export interface RootFallbackProps {
	/** Why it failed: a defect, an interrupt, or anything else thrown while rendering. */
	readonly cause: Cause.Cause<unknown>;
	/** Refreshes every failed atom, and renders the app again. */
	readonly retry: () => void;
}

const UnhandledTypeId = "~@raf-query/experimental-effect-atom/Unhandled";

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
 * atom can fail with, or else the data or what's left, as an `Unhandled`.
 */
export type Read<A, E> = [E] extends [never] ? A : A | Unhandled<E>;

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
	/** For error messages and React DevTools. */
	readonly name: string;
}

/** Who a boundary is: what routing, mounting and `caughtBy` need. */
export interface Info extends Link {
	readonly parent: Info | undefined;
}

/**
 * Element 0 of `root` and `catchErrors`: the component that mounts the
 * boundary, and the handle `catchErrors` builds the next one from.
 */
export interface Boundary<Handled> {
	(props: { readonly children?: React.ReactNode }): React.ReactNode;
	/** Type only: the errors this boundary and the ones above it catch. */
	readonly "~handled"?: (_: never) => Handled;
	readonly [TypeId]: Info;
}

/** Element 1 of `root` and `catchErrors`: reads atoms through the boundary. */
export interface Hook<Handled> {
	/**
	 * Reads an `AsyncResult` atom, suspending until it has a result. Errors a
	 * boundary in the chain catches go there; the rest come back as an
	 * `Unhandled`. When the chain catches them all, it returns the data.
	 */
	<A, E>(
		atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
	): Read<A, Exclude<E, Handled>>;
}

/** What `useSet` returns: writes the atom, and waits for its result. */
export type Setter<Handled, A, E, W> = (
	value: Exclude<W, Atom.Reset | Atom.Interrupt>,
) => Promise<Read<A, Exclude<E, Handled>>>;

/** The errors a boundary and the ones above it catch. */
export type HandledBy<B> = B extends Boundary<infer H> ? H : never;

export const isBoundary = (u: unknown): u is Boundary<unknown> =>
	Predicate.hasProperty(u, TypeId);

const MountedContext = React.createContext<ReadonlySet<Info>>(new Set());

const EscalationTypeId = "~@raf-query/experimental-effect-atom/Escalation";

/** What a hook throws to send a failure to a boundary above it. */
class Escalation extends Error {
	readonly [EscalationTypeId] = EscalationTypeId;
	readonly boundary: Info;
	readonly error: unknown;
	override readonly cause: Cause.Cause<unknown>;
	constructor(boundary: Info, error: unknown, cause: Cause.Cause<unknown>) {
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
	readonly boundary: Info;
	readonly cause: Cause.Cause<unknown>;
	/** The typed failure, or `undefined` when the root caught a defect or an interrupt. */
	readonly error: unknown;
	/** The boundary's `name`. */
	readonly name: string;
	/** Whether the root caught it. */
	readonly root: boolean;
}

/**
 * For `createRoot`'s `onCaughtError`: which boundary caught `u`, and why, when
 * `u` is a failure a hook sent to a boundary. `undefined` for anything else
 * React caught, such as an error thrown while rendering.
 */
const caughtOf = (
	boundary: Info,
	error: unknown,
	cause: Cause.Cause<unknown>,
): Caught => ({
	boundary,
	cause,
	error,
	name: boundary.name,
	root: boundary.parent === undefined,
});

export const caughtBy = (u: unknown): Caught | undefined =>
	isOwn(u) ? caughtOf(u.boundary, u.error, u.cause) : undefined;

interface Impl extends Info {
	readonly fallback: (props: FallbackProps<unknown>) => React.ReactNode;
	readonly onCaught: ((caught: Caught) => void) | undefined;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => React.ReactNode;
}

type AnyResult = AsyncResult.AsyncResult<unknown, unknown>;

/** Still loading: no result yet, or a failure being refreshed. A success being refreshed is stale data, and shows. */
const isPending = (result: AnyResult): boolean =>
	AsyncResult.isInitial(result) ||
	(AsyncResult.isFailure(result) && result.waiting);

/** Whether `boundary`'s `retry` refreshes this failure: one it catches, or any for the root. */
const retries = (boundary: Impl, cause: Cause.Cause<unknown>): boolean => {
	if (boundary.parent === undefined) {
		return true;
	}
	const found = Cause.findError(cause);
	return Result.isSuccess(found) && catches(boundary, found.success);
};

/**
 * Refreshes the failed atoms `boundary` retries. Function atoms (mutations)
 * are writable and skipped, so retrying doesn't send a write again.
 */
const refreshFailed = (registry: AtomRegistry.AtomRegistry, boundary: Impl) => {
	const refreshed = new Set<Atom.Atom<unknown>>();
	// `registry.refresh` follows `atom.refresh` to the atoms it wraps; doing it
	// here refreshes an atom and the one it wraps once, not twice.
	const refresh = <A,>(atom: Atom.Atom<A>): void => {
		if (refreshed.has(atom)) {
			return;
		}
		refreshed.add(atom);
		if (atom.refresh === undefined) {
			registry.refresh(atom);
		} else {
			atom.refresh(refresh);
		}
	};
	const failed = [...registry.getNodes().values()].filter((node) => {
		const value = Option.getOrUndefined(node.valueOption());
		return (
			!Atom.isWritable(node.atom) &&
			AsyncResult.isAsyncResult(value) &&
			AsyncResult.isFailure(value) &&
			!value.waiting &&
			retries(boundary, value.cause)
		);
	});
	for (const node of failed) {
		refresh(node.atom);
	}
};

interface CatcherProps {
	readonly boundary: Impl;
	readonly children?: React.ReactNode;
}

interface CatcherState {
	readonly caught: { readonly value: unknown } | undefined;
}

class Catcher extends React.Component<CatcherProps, CatcherState> {
	static override contextType = RegistryContext;
	declare context: React.ContextType<typeof RegistryContext>;
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
		refreshFailed(this.context, this.props.boundary);
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

const useMounted = (boundary: Impl): void => {
	if (!React.useContext(MountedContext).has(boundary)) {
		throw new Error(
			`use${boundary.name}() needs <${boundary.name}> above it: a boundary's hook reads through its own boundary.`,
		);
	}
};

interface Tracked extends Promise<void> {
	status: "pending" | "fulfilled";
	value: undefined;
}

/** What `React.use` gets once the result is in: it returns at once. */
const settled: Tracked = Object.assign(Promise.resolve(), {
	status: "fulfilled" as const,
	value: undefined,
});

const tracked = new WeakMap<
	AtomRegistry.AtomRegistry,
	WeakMap<Atom.Atom<AnyResult>, Tracked>
>();

/**
 * A thenable that settles when `atom` stops pending, shared by every reader
 * of it in `registry`. It records its `status` like React's own thenables, so
 * `use` returns at once on the render after it settles.
 *
 * It subscribes to the atom, which keeps the atom's node (and its request)
 * alive while the reader is suspended and not subscribed yet, and for a second
 * after, so the reader's render after the suspense finds the result.
 */
const whenSettled = (
	registry: AtomRegistry.AtomRegistry,
	atom: Atom.Atom<AnyResult>,
): Tracked => {
	let byAtom = tracked.get(registry);
	if (byAtom === undefined) {
		byAtom = new WeakMap();
		tracked.set(registry, byAtom);
	}
	const existing = byAtom.get(atom);
	if (existing !== undefined) {
		return existing;
	}
	const resolvers = Promise.withResolvers<void>();
	const status: Tracked["status"] = "pending";
	const thenable: Tracked = Object.assign(resolvers.promise, {
		status,
		value: undefined,
	});
	byAtom.set(atom, thenable);
	const settle = () => {
		if (thenable.status === "fulfilled") {
			return;
		}
		thenable.status = "fulfilled";
		byAtom.delete(atom);
		resolvers.resolve();
	};
	const unsubscribe = registry.subscribe(atom, (result) => {
		if (!isPending(result)) {
			settle();
		}
	});
	void resolvers.promise.then(() => setTimeout(unsubscribe, 1000));
	if (!isPending(registry.get(atom))) {
		settle();
	}
	return thenable;
};

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

const useRead = (boundary: Impl, atom: Atom.Atom<AnyResult>): unknown => {
	useMounted(boundary);
	const registry = React.useContext(RegistryContext);
	let result = useAtomValue(atom);
	// Called on every render, settled or not, so React sees the same hooks.
	React.use(isPending(result) ? whenSettled(registry, atom) : settled);
	// Settled, then refreshed again before this render: wait for that too.
	while (isPending(result)) {
		result = registry.get(atom);
		React.use(isPending(result) ? whenSettled(registry, atom) : settled);
	}
	return settle(boundary, AsyncResult.toExit(result));
};

const never = new Promise<never>(() => {});

const useWrite = (boundary: Impl, atom: Atom.Writable<AnyResult, unknown>) => {
	useMounted(boundary);
	const registry = React.useContext(RegistryContext);
	useAtomMount(atom);
	const [escalation, setEscalation] = React.useState<Escalation>();
	const set = React.useCallback(
		(value: unknown) => {
			registry.set(atom, value);
			return Effect.runPromiseExit(
				AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }),
			).then((exit) => {
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
			});
		},
		[atom, boundary, registry],
	);
	if (escalation !== undefined) {
		throw escalation;
	}
	return set;
};

const make = (options: {
	readonly errors: ReadonlyArray<Catchable>;
	readonly fallback: (props: FallbackProps<unknown>) => React.ReactNode;
	readonly name: string;
	readonly onCaught: ((caught: Caught) => void) | undefined;
	readonly parent: Impl | undefined;
	readonly rootFallback: (props: RootFallbackProps) => React.ReactNode;
}): readonly [Boundary<unknown>, Hook<unknown>] => {
	const impl: Impl = {
		errors: options.errors,
		fallback: options.fallback,
		name: options.name,
		onCaught: options.onCaught,
		parent: options.parent,
		rootFallback: options.rootFallback,
	};

	const Provider = (props: { readonly children?: React.ReactNode }) => {
		const above = React.useContext(MountedContext);
		const { parent } = impl;
		if (parent !== undefined && !above.has(parent)) {
			throw new Error(
				`<${impl.name}> needs <${parent.name}> above it: a boundary mounts inside the one it was made from.`,
			);
		}
		const mounted = React.useMemo(() => new Set([...above, impl]), [above]);
		return (
			<Catcher boundary={impl}>
				<MountedContext value={mounted}>{props.children}</MountedContext>
			</Catcher>
		);
	};
	Provider.displayName = options.name;

	const useBoundary = (atom: Atom.Atom<AnyResult>) => useRead(impl, atom);

	// SAFETY: `Boundary` and `Hook` type what is erased here: `settle` hands
	// back only failures no boundary in the chain catches, and `catchErrors`'
	// types say which those are.
	const boundary = Object.assign(Provider, {
		[TypeId]: impl,
	}) as Boundary<unknown>;
	// SAFETY: see `boundary`.
	const hook = useBoundary as Hook<unknown>;
	return [boundary, hook];
};

const implOf = (boundary: Boundary<unknown>): Impl => {
	const info = boundary[TypeId];
	// SAFETY: every `Boundary` comes from `make`, whose info is an `Impl`.
	return info as Impl;
};

/**
 * The outermost boundary. It catches what no typed boundary can: defects,
 * interrupts, and anything else thrown while rendering.
 */
export const root = (options: {
	readonly fallback: (props: RootFallbackProps) => React.ReactNode;
	readonly name: string;
	/** Called once for each failure a boundary of this chain renders its fallback for. */
	readonly onCaught?: ((caught: Caught) => void) | undefined;
}): readonly [Boundary<never>, Hook<never>] =>
	// SAFETY: see `make`; the root catches nothing typed.
	make({
		errors: [],
		fallback: () => null,
		name: options.name,
		onCaught: options.onCaught,
		parent: undefined,
		rootFallback: options.fallback,
	}) as readonly [Boundary<never>, Hook<never>];

/**
 * A boundary inside `parent` that also catches `errors`: `Effect.catchTags`
 * for the subtree it wraps. It can't catch what a boundary above catches.
 */
export const catchErrors = <Handled, const S extends ReadonlyArray<Catchable>>(
	parent: Boundary<Handled>,
	options: CatchOptions<S, NoInfer<Handled>>,
): readonly [
	Boundary<Handled | S[number]["Type"]>,
	Hook<Handled | S[number]["Type"]>,
] => {
	const above = implOf(parent);
	// SAFETY: the Catcher only renders it with an error one of `errors` accepted.
	const fallback = options.fallback as Impl["fallback"];
	// SAFETY: see `make`.
	return make({
		errors: options.errors,
		fallback,
		name: options.name,
		onCaught: undefined,
		parent: above,
		rootFallback: above.rootFallback,
	}) as readonly [
		Boundary<Handled | S[number]["Type"]>,
		Hook<Handled | S[number]["Type"]>,
	];
};

/**
 * A function that writes to an `AsyncResult` function atom (a mutation, say)
 * through `boundary`, which must be mounted above, and waits for its result.
 * Errors a boundary in the chain catches go there, and the promise never
 * settles; the rest come back as an `Unhandled`, as a read's do.
 *
 * A hook of its own, rather than a method of the boundary's hook: React
 * Compiler treats any property of a `use…` function as a hook used as a value.
 */
export const useSet = <Handled, A, E, W>(
	boundary: Boundary<Handled>,
	atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>,
): Setter<Handled, A, E, W> => {
	// SAFETY: `atom`'s types were checked by the signature; at runtime they are erased.
	const erased = atom as Atom.Writable<AnyResult, unknown>;
	// SAFETY: see `make`.
	return useWrite(implOf(boundary), erased) as Setter<Handled, A, E, W>;
};
