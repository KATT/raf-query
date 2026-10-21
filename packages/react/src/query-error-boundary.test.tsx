import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Effect, Layer, Schema } from "effect";
import { Component, type ReactNode, Suspense, use } from "react";

import {
	errorTypes,
	QueryClient,
	QueryClientProvider,
	QueryErrorBoundary,
	type QueryHandle,
	queryOptions,
	type RedactedError,
	useQuery,
} from "./index.ts";

class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	"Unauthorized",
	{},
) {}
class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
	userId: Schema.String,
}) {}

type Outcome = "found" | "missing" | "signed-out";

function createBackend() {
	const outcomes = new Map<number, Outcome>();
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () =>
				Effect.gen(function* () {
					switch (outcomes.get(input.id) ?? "found") {
						case "missing":
							return yield* Effect.fail(new IssueNotFound({ id: input.id }));
						case "signed-out":
							return yield* Effect.fail(new Unauthorized());
						case "found":
							return { id: input.id, title: `Issue ${input.id}` };
					}
				}),
			queryKey: ["issue", input.id],
			retry: false,
			throwOnError: true,
		});
	}
	return { issueQuery, outcomes };
}

function assigneeQuery(input: { userId: string }) {
	return queryOptions({
		queryFn: () => Effect.fail(new UserNotFound({ userId: input.userId })),
		queryKey: ["assignee", input.userId],
		retry: false,
		throwOnError: true,
	});
}

interface OuterState {
	readonly error: unknown;
}

class Outer extends Component<{ readonly children: ReactNode }, OuterState> {
	override state: OuterState = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		if (this.state.error !== null) {
			return <p>{`Outer: ${String(this.state.error)}`}</p>;
		}
		return this.props.children;
	}
}

async function mount(ui: ReactNode) {
	return act(async () => render(ui));
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
	});
}

function setup() {
	const backend = createBackend();
	const client = new QueryClient({ isServer: false, layer: Layer.empty });
	const issueQuery = backend.issueQuery;
	function Title(props: { readonly handle: QueryHandle<typeof issueQuery> }) {
		const [issuePromise] = useQuery(issueQuery, props.handle);
		const issue = use(issuePromise);
		return <p>{issue.title}</p>;
	}
	function view(children: ReactNode) {
		return (
			<QueryClientProvider client={client}>
				<Outer>
					<QueryErrorBoundary
						catchTags={{
							IssueNotFound: (props) => {
								expectTypeOf(props.error).toEqualTypeOf<IssueNotFound>();
								return (
									<button onClick={props.reset} type="button">
										{`No issue ${props.error.id}`}
									</button>
								);
							},
						}}
						query={issueQuery}
					>
						<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
					</QueryErrorBoundary>
				</Outer>
			</QueryClientProvider>
		);
	}
	return { backend, client, issueQuery, Title, view };
}

describe("QueryErrorBoundary", () => {
	it("renders the handler for the error's tag", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "missing");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		expect(screen.getByText("No issue 1")).toBeDefined();
		cleanup();
	});

	it("re-throws a tag it has no handler for", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "signed-out");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		expect(screen.getByText(/^Outer: Unauthorized/)).toBeDefined();
		cleanup();
	});

	it("refetches on reset", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "missing");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		test.backend.outcomes.set(1, "found");
		await act(async () => {
			screen.getByText("No issue 1").click();
		});
		await settle();
		expect(screen.getByText("Issue 1")).toBeDefined();
		cleanup();
	});

	it("handles the errors of several factories", async () => {
		const client = new QueryClient({ isServer: false, layer: Layer.empty });
		const backend = createBackend();
		function Assignee(props: {
			readonly handle: QueryHandle<typeof assigneeQuery>;
		}) {
			const [assigneePromise] = useQuery(assigneeQuery, props.handle);
			use(assigneePromise);
			return <p>assignee</p>;
		}
		const handle = client.prefetch(assigneeQuery, { userId: "ada" });
		await mount(
			<QueryClientProvider client={client}>
				<QueryErrorBoundary
					catchTags={{
						IssueNotFound: () => <p>No issue</p>,
						UserNotFound: (props) => <p>{`No user ${props.error.userId}`}</p>,
					}}
					query={[backend.issueQuery, assigneeQuery]}
				>
					<Suspense fallback={<p>Loading</p>}>
						<Assignee handle={handle} />
					</Suspense>
				</QueryErrorBoundary>
			</QueryClientProvider>,
		);
		await settle();
		expect(screen.getByText("No user ada")).toBeDefined();
		cleanup();
	});

	it("handles a promise query's declared errors", async () => {
		const client = new QueryClient({ isServer: false });
		function sessionQuery() {
			return queryOptions({
				errors: errorTypes(Unauthorized),
				queryFn: () => Promise.reject(new Unauthorized()),
				queryKey: ["session"],
				retry: false,
				throwOnError: true,
			});
		}
		function Session(props: {
			readonly handle: QueryHandle<typeof sessionQuery>;
		}) {
			const [sessionPromise] = useQuery(sessionQuery, props.handle);
			use(sessionPromise);
			return <p>signed in</p>;
		}
		const handle = client.prefetch(sessionQuery);
		await mount(
			<QueryClientProvider client={client}>
				<QueryErrorBoundary
					catchTags={{ Unauthorized: () => <p>Sign in</p> }}
					query={sessionQuery}
				>
					<Suspense fallback={<p>Loading</p>}>
						<Session handle={handle} />
					</Suspense>
				</QueryErrorBoundary>
			</QueryClientProvider>,
		);
		await settle();
		expect(screen.getByText("Sign in")).toBeDefined();
		cleanup();
	});

	it("only takes tags the factories can fail with", () => {
		const issueQuery = createBackend().issueQuery;
		function plainQuery() {
			return queryOptions({
				queryFn: () => Promise.resolve("a"),
				queryKey: ["plain"],
			});
		}
		function typeOnly() {
			QueryErrorBoundary({
				catchTags: {
					// @ts-expect-error a typo of IssueNotFound
					IssueNotFond: () => null,
				},
				query: issueQuery,
			});
			QueryErrorBoundary({
				catchTags: {
					// @ts-expect-error the issue query can't fail with UserNotFound
					UserNotFound: () => null,
				},
				query: issueQuery,
			});
			QueryErrorBoundary({
				catchTags: {
					RedactedError: (props) => {
						expectTypeOf(props.error).toEqualTypeOf<RedactedError>();
						return null;
					},
					// @ts-expect-error a promise query without declared errors has no tags
					Unauthorized: () => null,
				},
				query: plainQuery,
			});
		}
		expect(typeOnly).toBeTypeOf("function");
	});
});
