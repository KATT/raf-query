"use client";

/**
 * Typed error boundaries: each owns some errors for the tree under it, so
 * the reads below that pass its hook type their `Result` without them.
 *
 * ```tsx
 * const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
 *   name: "Auth",
 *   claims: [Unauthorized],
 *   fallback: SignIn,
 * });
 *
 * function IssueTitle(props: { handle: QueryHandle<typeof issueQuery> }) {
 *   const [issue] = useQuery(issueQuery, props.handle, {
 *     throwOnError: useAuthBoundary(),
 *   });
 *   // Thenable<Result<Issue, IssueNotFound>>: Unauthorized went to <AuthBoundary>
 * }
 * ```
 */
import {
	type ErrorGuard,
	errorTypes,
	type GuardedError,
} from "@raf-query/core";
import { Component, createContext, type ReactNode, use } from "react";

/** What a boundary's `fallback` gets: the error it owns, and `reset`. */
export interface ErrorBoundaryFallbackProps<TError> {
	readonly error: TError;
	/**
	 * Renders the children again. A query whose first load failed refetches
	 * when it's read again.
	 */
	readonly reset: () => void;
}

declare const ownedType: unique symbol;

/**
 * What a boundary's hook returns: the errors it and the boundaries above it
 * own. Pass it as a read's `throwOnError`: those errors reject to the
 * boundary that claims them, and the rest settle as a `Result` typed
 * without them.
 */
export interface ErrorBoundaryClaims<TOwned> {
	/** Type-only: what this boundary and the ones above it own. */
	readonly [ownedType]?: () => TOwned;
	/** Whether this boundary or one above it owns `error`. */
	owns(error: unknown): boolean;
}

/**
 * A boundary's component: renders `fallback` for the errors it claims and
 * re-throws the rest to the boundaries above it.
 */
export interface ErrorBoundaryComponent<TOwned> {
	(props: { readonly children?: ReactNode }): ReactNode;
	displayName: string;
	/** Type-only: what this boundary and the ones above it own. */
	readonly [ownedType]?: () => TOwned;
}

export interface ErrorBoundarySpec<
	TGuards extends ReadonlyArray<ErrorGuard>,
	TParentOwned,
> {
	/** The errors this boundary owns: classes, or type guards. */
	readonly claims: TGuards;
	readonly fallback: (
		props: ErrorBoundaryFallbackProps<GuardedError<TGuards[number]>>,
	) => ReactNode;
	/** Names it in messages and React DevTools: `"Auth"` is `<AuthBoundary>`. */
	readonly name: string;
	/** The boundary it sits under, which must be mounted above it. */
	readonly parent?: ErrorBoundaryComponent<TParentOwned>;
}

/** The component, and the hook that returns its claims. Name them freely. */
export type ErrorBoundary<TOwned> = readonly [
	Boundary: ErrorBoundaryComponent<TOwned>,
	useBoundary: () => ErrorBoundaryClaims<TOwned>,
];

interface Internal {
	readonly claims: (error: unknown) => boolean;
	readonly displayName: string;
	readonly fallback: (props: ErrorBoundaryFallbackProps<never>) => ReactNode;
	readonly owned: ErrorBoundaryClaims<unknown>;
	readonly parent: Internal | undefined;
}

/** The boundaries mounted above a component, nearest first. */
interface Mounted {
	readonly boundary: Internal;
	readonly parent: Mounted | undefined;
}

const MountedBoundaries = createContext<Mounted | undefined>(undefined);

const internals = new WeakMap<object, Internal>();

const claimsObjects = new WeakSet<object>();

/** Whether a read's `throwOnError` is a boundary's claims. */
export function isErrorBoundaryClaims(
	value: unknown,
): value is ErrorBoundaryClaims<unknown> {
	return (
		typeof value === "object" && value !== null && claimsObjects.has(value)
	);
}

function isMounted(at: Mounted | undefined, boundary: Internal) {
	for (let mounted = at; mounted; mounted = mounted.parent) {
		if (mounted.boundary === boundary) {
			return true;
		}
	}
	return false;
}

interface CatcherProps {
	readonly above: Mounted | undefined;
	readonly boundary: Internal;
	readonly children?: ReactNode;
}

interface CatcherState {
	readonly caught: { readonly error: unknown } | undefined;
}

class Catcher extends Component<CatcherProps, CatcherState> {
	override state: CatcherState = { caught: undefined };

	static getDerivedStateFromError(error: unknown): CatcherState {
		return { caught: { error } };
	}

	override render(): ReactNode {
		const props = this.props;
		const boundary = props.boundary;
		const caught = this.state.caught;
		if (!caught) {
			return (
				<MountedBoundaries value={{ boundary, parent: props.above }}>
					{props.children}
				</MountedBoundaries>
			);
		}
		if (!boundary.claims(caught.error)) {
			throw caught.error;
		}
		// SAFETY: `claims` accepted it, and the fallback is typed by the
		// claims' guards.
		const error = caught.error as never;
		return boundary.fallback({
			error,
			reset: () => {
				this.setState({ caught: undefined });
			},
		});
	}
}

/**
 * Creates an error boundary that owns some errors for the tree under it,
 * returned as `[Boundary, useBoundary]`. A read that passes
 * `useBoundary()` as its `throwOnError` throws the errors this boundary or
 * one above it owns, to the nearest one that claims them, and settles the
 * rest as a `Result` typed without them. A boundary re-throws what it
 * doesn't claim, so an error no boundary owns reaches the app's own error
 * boundary. `parent` is the boundary it sits under; its owned errors add
 * up along the chain.
 *
 * Claims are checked at runtime, so a fallback's `error` is what it claims
 * even when the error came from somewhere the types don't see (a server
 * render's `RedactedError` claims nothing and goes past).
 */
export function createErrorBoundary<
	const TGuards extends ReadonlyArray<ErrorGuard>,
	TParentOwned = never,
>(
	spec: ErrorBoundarySpec<TGuards, TParentOwned>,
): ErrorBoundary<GuardedError<TGuards[number]> | TParentOwned> {
	const parent = spec.parent ? internals.get(spec.parent) : undefined;
	const claims = errorTypes(...spec.claims).is ?? (() => false);
	const owned: ErrorBoundaryClaims<unknown> = {
		owns: (error) => claims(error) || (parent?.owned.owns(error) ?? false),
	};
	claimsObjects.add(owned);
	// SAFETY: the fallback only gets errors `claims` accepted.
	const fallback = spec.fallback as Internal["fallback"];
	const boundary: Internal = {
		claims,
		displayName: `${spec.name}Boundary`,
		fallback,
		owned,
		parent,
	};

	function Boundary(props: { readonly children?: ReactNode }) {
		const above = use(MountedBoundaries);
		if (parent && !isMounted(above, parent)) {
			throw new Error(
				`<${boundary.displayName}> needs <${parent.displayName}>, its parent, above it`,
			);
		}
		return (
			<Catcher above={above} boundary={boundary}>
				{props.children}
			</Catcher>
		);
	}
	Boundary.displayName = boundary.displayName;
	internals.set(Boundary, boundary);

	function useBoundary() {
		if (!isMounted(use(MountedBoundaries), boundary)) {
			throw new Error(
				`The ${spec.name} error boundary's hook found no <${boundary.displayName}> above it: wrap the tree in <${boundary.displayName}>`,
			);
		}
		return owned;
	}

	// SAFETY: the phantom `[ownedType]` fields are never present at runtime;
	// they carry the owned errors from `claims` and `parent`.
	return [Boundary, useBoundary] as unknown as ErrorBoundary<
		GuardedError<TGuards[number]> | TParentOwned
	>;
}
