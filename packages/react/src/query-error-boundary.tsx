"use client";

/**
 * An error boundary typed by the queries under it: its handlers are keyed by
 * the tags of the factories' errors, as `Effect.catchTags` is by an Effect's.
 *
 * ```tsx
 * <QueryErrorBoundary
 *   query={issueQuery}
 *   catchTags={{ IssueNotFound: (props) => <p>No issue {props.error.id}</p> }}
 * >
 *   <IssuePage />
 * </QueryErrorBoundary>
 * ```
 */
import type { ErrorOf, QueryFactory, RedactedError } from "@raf-query/core";
import { Predicate } from "effect";
import { Component, type ReactNode } from "react";

/** One factory, or several whose errors the boundary handles together. */
export type QueryFactories = QueryFactory | ReadonlyArray<QueryFactory>;

type FactoryOf<TQueries> =
	TQueries extends ReadonlyArray<infer TFactory> ? TFactory : TQueries;

type ErrorOfEach<TFactory> = TFactory extends QueryFactory
	? ErrorOf<TFactory>
	: never;

/**
 * What a read of the factories can throw that has a `_tag`: their errors
 * (an Effect `queryFn`'s inferred one, or declared `errors`), and the
 * `RedactedError` a query that failed during server rendering rejects with.
 */
export type CatchableError<TQueries extends QueryFactories> = Extract<
	ErrorOfEach<FactoryOf<TQueries>> | RedactedError,
	{ readonly _tag: string }
>;

/** What a handler gets: the error with its tag, and `reset`. */
export interface CatchTagProps<TError> {
	readonly error: TError;
	/**
	 * Renders the children again. A query whose first load failed refetches
	 * when it's read again.
	 */
	readonly reset: () => void;
}

/** A handler per tag the factories can fail with; each is optional. */
export type CatchTags<TQueries extends QueryFactories> = {
	readonly [TTag in CatchableError<TQueries>["_tag"]]?: (
		props: CatchTagProps<
			Extract<CatchableError<TQueries>, { readonly _tag: TTag }>
		>,
	) => ReactNode;
};

export interface QueryErrorBoundaryProps<TQueries extends QueryFactories> {
	readonly catchTags: CatchTags<TQueries>;
	readonly children?: ReactNode;
	/** The factory, or factories, whose errors `catchTags` handles. */
	readonly query: TQueries;
}

interface CatcherProps {
	readonly catchTags: Readonly<
		Record<string, ((props: CatchTagProps<never>) => ReactNode) | undefined>
	>;
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
		const caught = this.state.caught;
		if (!caught) {
			return props.children;
		}
		const error = caught.error;
		const tag = Object.keys(props.catchTags).find((key) =>
			Predicate.isTagged(error, key),
		);
		const handler = tag === undefined ? undefined : props.catchTags[tag];
		if (!handler) {
			throw error;
		}
		// SAFETY: the handler is the one for this error's tag, which is typed
		// as the factories' error with that tag.
		const tagged = error as never;
		return handler({
			error: tagged,
			reset: () => {
				this.setState({ caught: undefined });
			},
		});
	}
}

/**
 * An error boundary for the queries `query` names. `catchTags` has a handler
 * per tag their errors can have, inferred from the factories: an Effect
 * `queryFn`'s error, or a promise `queryFn`'s declared `errors`. A tag the
 * factories can't fail with is a type error, and each handler's `error` is
 * typed by its tag. An error with no handler is re-thrown to the boundaries
 * above.
 *
 * Reads under it throw to it as they do to any error boundary: every promise
 * read, and an Effect or declared-errors read with `throwOnError: true` (on
 * the read, the query or the client).
 */
export function QueryErrorBoundary<const TQueries extends QueryFactories>(
	props: QueryErrorBoundaryProps<TQueries>,
): ReactNode {
	// SAFETY: `CatchTags` maps each tag to a handler for that tag's error,
	// and the catcher calls a handler only with an error of its tag.
	const catchTags = props.catchTags as CatcherProps["catchTags"];
	return <Catcher catchTags={catchTags}>{props.children}</Catcher>;
}
