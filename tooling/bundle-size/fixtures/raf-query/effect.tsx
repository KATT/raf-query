import {
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "@raf-query/react";
import { fromContext, fromLayer, retrySchedule } from "@raf-query/react/effect";
import { Context, Data, Effect, Layer, Schedule } from "effect";
import { Suspense, use } from "react";

import { getIssue } from "../shared/api.ts";

class IssueRequestError extends Data.TaggedError("IssueRequestError")<{
	readonly cause: unknown;
}> {}

export function effectIssueQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.tryPromise({
				catch: (cause) => new IssueRequestError({ cause }),
				try: () => getIssue(input.id),
			}),
		queryKey: ["issues", input.id],
		retry: retrySchedule(
			Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
		),
	});
}

function IssueTitle(props: {
	readonly handle: QueryHandle<typeof effectIssueQuery>;
}) {
	const [issuePromise] = useQuery(effectIssueQuery, props.handle);
	return <h1>{use(issuePromise).title}</h1>;
}

/** `queryApp` with an Effect `queryFn` and `Schedule` retries. */
export function effectApp() {
	const queryClient = new QueryClient({
		services: fromContext(Context.empty()),
	});
	const issue = queryClient.prefetch(effectIssueQuery, { id: 1 });
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<IssueTitle handle={issue} />
			</Suspense>
		</QueryClientProvider>
	);
}

class IssueApi extends Context.Service<
	IssueApi,
	{ readonly get: (id: number) => Effect.Effect<{ readonly title: string }> }
>()("fixtures/IssueApi") {}

const IssueApiLive = Layer.succeed(IssueApi, {
	get: (id) => Effect.promise(() => getIssue(id)),
});

export function serviceIssueQuery(input: { readonly id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.gen(function* () {
				const api = yield* IssueApi;
				return yield* api.get(input.id);
			}),
		queryKey: ["issues", input.id],
	});
}

function ServiceIssueTitle(props: {
	readonly handle: QueryHandle<typeof serviceIssueQuery>;
}) {
	const [issuePromise] = useQuery(serviceIssueQuery, props.handle);
	return <h1>{use(issuePromise).title}</h1>;
}

/** `queryApp` with a `queryFn` that needs a service from a layer. */
export function layerApp() {
	const queryClient = new QueryClient({ services: fromLayer(IssueApiLive) });
	const issue = queryClient.prefetch(serviceIssueQuery, { id: 1 });
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback="Loading">
				<ServiceIssueTitle handle={issue} />
			</Suspense>
		</QueryClientProvider>
	);
}
