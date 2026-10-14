/**
 * The issue tracker the Effect pages' `twoslash` blocks import above
 * `// ---cut---`. "Using Effect" (`effect.md`) shows this code in full, so
 * keep the two in step.
 */
import {
	type EnsuredQueryHandle,
	QueryCache,
	type QueryClient,
	type QueryHandle,
	queryOptions,
} from "@raf-query/react";
import { Context, Effect, type Layer, Schema } from "effect";
import type { ReactNode } from "react";

export interface Issue {
	readonly assigneeId: string;
	readonly body: string;
	readonly id: number;
	readonly title: string;
}

export interface User {
	readonly id: string;
	readonly name: string;
}

export class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}

export class EmptyTitle extends Schema.TaggedError<EmptyTitle>()(
	"EmptyTitle",
	{},
) {}

export class IssueApi extends Context.Service<
	IssueApi,
	{
		readonly assignee: (
			issueId: number,
		) => Effect.Effect<User, IssueNotFound | Unauthorized>;
		readonly get: (
			id: number,
		) => Effect.Effect<Issue, IssueNotFound | Unauthorized>;
		readonly rename: (input: {
			readonly id: number;
			readonly title: string;
		}) => Effect.Effect<Issue, EmptyTitle | Unauthorized>;
	}
>()("app/IssueApi") {}

/** An HTTP or RPC client in a real app. */
export declare const IssueApiLive: Layer.Layer<IssueApi>;

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => IssueApi.use((api) => api.get(input.id)),
		queryKey: ["issue", input.id],
	});
}

export function assigneeQuery(input: { issueId: number }) {
	return queryOptions({
		queryFn: () => IssueApi.use((api) => api.assignee(input.issueId)),
		queryKey: ["issue", input.issueId, "assignee"],
		retry: (failures, error) =>
			failures <= 3 && !Schema.is(Unauthorized)(error),
	});
}

export const rename = Effect.fn("rename")(
	function* (input: { readonly id: number; readonly title: string }) {
		const api = yield* IssueApi;
		const cache = yield* QueryCache.QueryCache;
		yield* api.rename(input);
		yield* cache.invalidate({ queryKey: ["issue", input.id] });
		return null;
	},
	Effect.catchTags({
		EmptyTitle: () => Effect.succeed("Title can't be empty"),
		Unauthorized: () => Effect.succeed("Sign in to rename issues"),
	}),
);

export interface RouterContext {
	readonly queryClient: QueryClient<IssueApi>;
}

/**
 * TanStack Router's `createFileRoute`, typed with the issue tracker's router
 * context and without an app's route tree.
 */
export declare function createFileRoute(path: string): <TLoaderData>(options: {
	readonly component?: () => ReactNode;
	readonly errorComponent?: (props: {
		readonly error: unknown;
		readonly reset: () => void;
	}) => ReactNode;
	readonly loader?: (args: {
		readonly context: RouterContext;
		readonly params: Record<string, string>;
	}) => Promise<TLoaderData> | TLoaderData;
}) => {
	useLoaderData(): TLoaderData;
	useRouteContext(): RouterContext;
};

/** The issue page's route, for components in their own files. */
export declare const IssueRoute: {
	useLoaderData(): {
		readonly assignee: QueryHandle<typeof assigneeQuery>;
		readonly issue: EnsuredQueryHandle<typeof issueQuery>;
	};
	useRouteContext(): RouterContext;
};
