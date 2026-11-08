"use client";

import {
	type ErrorOf,
	type Fail,
	failOf,
	isQueryFailure,
	type QueryFactory,
} from "@raf-query/core";
import { fetchEntry, reset } from "@raf-query/core/internal";
import { type QueryClient, useQueryClient } from "@raf-query/react";
import { Component, type ReactNode, Suspense } from "react";

type Caught<TFactory extends QueryFactory> = [ErrorOf<TFactory>] extends [never]
	? Fail
	: Extract<ErrorOf<TFactory>, { readonly _tag: string }>;

/**
 * One handler per expected error tag. Each gets the `fail()` value with its
 * tag and a `retry` that refetches the failed query and renders the
 * children again.
 */
export type CatchHandlers<TError extends { readonly _tag: string }> = {
	readonly [TTag in TError["_tag"]]?: (
		error: string extends TError["_tag"]
			? TError
			: Extract<TError, { readonly _tag: TTag }>,
		retry: () => void,
	) => ReactNode;
};

export interface QueryBoundaryProps<TFactory extends QueryFactory> {
	readonly catch?: CatchHandlers<Caught<TFactory>>;
	readonly children?: ReactNode;
	/** The Suspense fallback while the children load. */
	readonly fallback?: ReactNode;
	/** The query whose errors this catches. It types `catch`; nothing reads it. */
	readonly query?: TFactory;
}

interface CatcherProps {
	readonly children?: ReactNode;
	readonly client: QueryClient;
	readonly handlers: Partial<
		Record<string, (error: Fail, retry: () => void) => ReactNode>
	>;
}

interface CatcherState {
	readonly caught: boolean;
	readonly error: unknown;
}

class Catcher extends Component<CatcherProps, CatcherState> {
	static getDerivedStateFromError(error: unknown): CatcherState {
		return { caught: true, error };
	}

	override state: CatcherState = { caught: false, error: undefined };

	retry = () => {
		const error = this.state.error;
		const entry = isQueryFailure(error)
			? this.props.client["~entries"].get(error.hash)
			: undefined;
		if (entry) {
			void reset(entry);
			void fetchEntry(entry);
		}
		this.setState({ caught: false, error: undefined });
	};

	override render(): ReactNode {
		if (!this.state.caught) {
			return this.props.children;
		}
		const error = this.state.error;
		const failed = failOf(error);
		const handler = failed ? this.props.handlers[failed._tag] : undefined;
		if (!failed || !handler) {
			// Not ours: the next boundary up decides.
			throw error;
		}
		return handler(failed, this.retry);
	}
}

/**
 * A Suspense and error boundary for a query's expected errors. The handlers
 * in `catch` are typed from the query's `fail()` values; anything else (a
 * defect, a tag with no handler) goes to the next error boundary.
 *
 * Error boundaries don't run during server rendering, so on the server an
 * error reaches the framework's error handling and the browser renders the
 * handler when it retries.
 */
export function QueryBoundary<TFactory extends QueryFactory>(
	props: QueryBoundaryProps<TFactory>,
): ReactNode {
	const client = useQueryClient();
	// SAFETY: each handler gets the `fail()` value its tag names.
	const handlers = (props.catch ?? {}) as CatcherProps["handlers"];
	return (
		<Catcher client={client} handlers={handlers}>
			<Suspense fallback={props.fallback}>{props.children}</Suspense>
		</Catcher>
	);
}
