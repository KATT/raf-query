"use client";

/**
 * Typed error boundaries for Effect Atom: each owns some errors for the tree
 * under it, and a component that reads an atom through `useAtomResult` with
 * its claims gets an `AsyncResult` typed without them.
 *
 * ```tsx
 * const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
 *   name: "Auth",
 *   claims: [Unauthorized],
 *   fallback: SignIn,
 * });
 *
 * function IssueTitle(props: { readonly id: number }) {
 *   const issue = useAtomResult(issueAtom(props.id), useAuthBoundary());
 *   // Success<Issue, IssueNotFound> | Failure<Issue, IssueNotFound>
 * }
 * ```
 *
 * The registry already caches each atom's `AsyncResult`, so narrowing it is
 * a check during render: there is nothing to cache per boundary.
 */
import { RegistryContext, useAtomSuspense } from "@effect/atom-react";
import { Cause, Option } from "effect";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import type * as Atom from "effect/reactivity/Atom";
import type * as AtomRegistry from "effect/reactivity/AtomRegistry";
import { Component, createContext, type ReactNode, use } from "react";

/** A type guard, or a class whose instances are the error. */
export type ErrorGuard<TError = unknown> =
	// oxlint-disable-next-line typescript/no-explicit-any -- any constructor's parameters
	| (abstract new (...args: any) => TError)
	| ((error: unknown) => error is TError);

/** The error an {@link ErrorGuard} accepts. */
export type GuardedError<TGuard> = TGuard extends abstract new (
	// oxlint-disable-next-line typescript/no-explicit-any -- any constructor's parameters
	...args: any
) => infer TError
	? TError
	: TGuard extends ((error: unknown) => error is infer TError)
		? TError
		: never;

/** What a boundary's `fallback` gets: the error it owns, and `reset`. */
export interface ErrorBoundaryFallbackProps<TError> {
	readonly error: TError;
	/** Refreshes the atom that failed and renders the children again. */
	readonly reset: () => void;
}

declare const ownedType: unique symbol;

/**
 * What a boundary's hook returns: the errors it and the boundaries above it
 * own. Pass it to {@link useAtomResult}: those errors throw to the boundary
 * that claims them, and the rest stay in the `AsyncResult`.
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

interface FailedRead {
	// oxlint-disable-next-line typescript/no-explicit-any -- any atom's value
	readonly atom: Atom.Atom<any>;
	readonly registry: AtomRegistry.AtomRegistry;
}

/**
 * The atom each thrown error came from, so the boundary that shows it can
 * refresh that atom on `reset`. Keyed by the error, which is what the
 * boundary catches.
 */
const failedReads = new WeakMap<object, FailedRead>();

function isMounted(at: Mounted | undefined, boundary: Internal) {
	for (let mounted = at; mounted; mounted = mounted.parent) {
		if (mounted.boundary === boundary) {
			return true;
		}
	}
	return false;
}

function isClass(
	guard: ErrorGuard,
	// oxlint-disable-next-line typescript/no-explicit-any -- any constructor's parameters
): guard is abstract new (...args: any) => unknown {
	return (
		typeof guard.prototype === "object" &&
		guard.prototype !== null &&
		Function.prototype.toString.call(guard).startsWith("class")
	);
}

/** Whether `value` can key a `WeakMap`: errors that aren't can't be refreshed on `reset`. */
function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

function guardCheck(guard: ErrorGuard): (error: unknown) => boolean {
	if (!isClass(guard)) {
		return guard;
	}
	const AnError = guard;
	return (error) => error instanceof AnError;
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
		const error = caught.error;
		if (!boundary.claims(error)) {
			throw error;
		}
		// SAFETY: `claims` accepted it, and the fallback is typed by the
		// claims' guards.
		const claimed = error as never;
		return boundary.fallback({
			error: claimed,
			reset: () => {
				const read = isObject(error) ? failedReads.get(error) : undefined;
				read?.registry.refresh(read.atom);
				this.setState({ caught: undefined });
			},
		});
	}
}

/**
 * Creates an error boundary that owns some errors for the tree under it,
 * returned as `[Boundary, useBoundary]`. A component that reads an atom
 * with `useAtomResult(atom, useBoundary())` throws the errors this boundary
 * or one above it owns, to the nearest one that claims them, and keeps the
 * rest in an `AsyncResult` typed without them. `parent` is the boundary it
 * sits under; its owned errors add up along the chain.
 *
 * Claims are checked at runtime, so a fallback's `error` is what it claims,
 * and a boundary re-throws what it doesn't claim.
 */
export function createErrorBoundary<
	const TGuards extends ReadonlyArray<ErrorGuard>,
	TParentOwned = never,
>(
	spec: ErrorBoundarySpec<TGuards, TParentOwned>,
): ErrorBoundary<GuardedError<TGuards[number]> | TParentOwned> {
	const parent = spec.parent ? internals.get(spec.parent) : undefined;
	const checks = spec.claims.map(guardCheck);
	const claims = (error: unknown) => checks.some((check) => check(error));
	const owned: ErrorBoundaryClaims<unknown> = {
		owns: (error) => claims(error) || (parent?.owned.owns(error) ?? false),
	};
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

/** What {@link useAtomResult} returns: the atom's result without the owned errors. */
export type ClaimedResult<A, E, TOwned> =
	| AsyncResult.Failure<A, Exclude<E, TOwned>>
	| AsyncResult.Success<A, Exclude<E, TOwned>>;

/**
 * Reads an `AsyncResult` atom through Suspense, as `useAtomSuspense` does,
 * and hands the boundaries in `claims` the errors they own: a failure with
 * one of them throws to the nearest boundary that claims it, and any other
 * failure is returned, typed without the owned errors. A defect or an
 * interruption isn't a typed error, so it throws to the app's own error
 * boundary.
 */
export function useAtomResult<A, E, TOwned>(
	atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
	claims: ErrorBoundaryClaims<TOwned>,
	options?: { readonly suspendOnWaiting?: boolean },
): ClaimedResult<A, E, TOwned> {
	const registry = use(RegistryContext);
	const current = registry.get(atom);
	// A failure a boundary reset is refreshing would throw again; wait for
	// the new result instead.
	const retrying = AsyncResult.isFailure(current) && current.waiting;
	const result = useAtomSuspense(atom, {
		includeFailure: true,
		suspendOnWaiting: retrying || (options?.suspendOnWaiting ?? false),
	});
	if (AsyncResult.isFailure(result)) {
		const error = Cause.findErrorOption(result.cause);
		if (Option.isNone(error)) {
			throw Cause.squash(result.cause);
		}
		if (claims.owns(error.value)) {
			if (isObject(error.value)) {
				failedReads.set(error.value, { atom, registry });
			}
			throw error.value;
		}
	}
	// SAFETY: a failure with an owned error threw above, so what's left can
	// only fail with the errors no boundary owns.
	const unowned = result as ClaimedResult<A, E, TOwned>;
	return unowned;
}
