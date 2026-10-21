import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Effect, Layer, Result, Schema } from "effect";
import { Component, type ReactNode, Suspense, use } from "react";

import {
	createErrorBoundary,
	errorTypes,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	type Thenable,
	useQuery,
} from "./index.ts";

class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
	reason: Schema.String,
}) {}
class Offline extends Schema.TaggedError<Offline>()("Offline", {}) {}
class IssueNotFound extends Schema.TaggedError<IssueNotFound>()(
	"IssueNotFound",
	{ id: Schema.Number },
) {}

type Outcome = "found" | "missing" | "offline" | "signed-out";

function createBackend() {
	const outcomes = new Map<number, Outcome>();
	function readIssue(id: number) {
		return Effect.gen(function* () {
			switch (outcomes.get(id) ?? "found") {
				case "missing":
					return yield* Effect.fail(new IssueNotFound({ id }));
				case "offline":
					return yield* Effect.fail(new Offline());
				case "signed-out":
					return yield* Effect.fail(new Unauthorized({ reason: "expired" }));
				case "found":
					return { id, title: `Issue ${id}` };
			}
		});
	}
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => readIssue(input.id),
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	return { issueQuery, outcomes };
}

const [OfflineBoundary, useOfflineBoundary] = createErrorBoundary({
	claims: [Offline],
	fallback: () => <p>You are offline</p>,
	name: "Offline",
});

const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
	claims: [Unauthorized],
	fallback: (props) => {
		expectTypeOf(props.error).toEqualTypeOf<Unauthorized>();
		return (
			<button onClick={props.reset} type="button">
				{`Sign in again (${props.error.reason})`}
			</button>
		);
	},
	name: "Auth",
	parent: OfflineBoundary,
});

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
		const [issuePromise] = useQuery(issueQuery, props.handle, {
			throwOnError: useAuthBoundary(),
		});
		expectTypeOf(issuePromise).toEqualTypeOf<
			Thenable<Result.Result<{ id: number; title: string }, IssueNotFound>>
		>();
		return (
			<p>
				{Result.match(use(issuePromise), {
					onFailure: (error) => `No issue ${error.id}`,
					onSuccess: (issue) => issue.title,
				})}
			</p>
		);
	}

	function view(children: ReactNode) {
		return (
			<QueryClientProvider client={client}>
				<Outer>
					<OfflineBoundary>
						<AuthBoundary>
							<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
						</AuthBoundary>
					</OfflineBoundary>
				</Outer>
			</QueryClientProvider>
		);
	}
	return { backend, client, issueQuery, Title, view };
}

describe("createErrorBoundary", () => {
	it("settles errors no boundary owns as a Result", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "missing");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		expect(screen.getByText("No issue 1")).toBeDefined();
		cleanup();
	});

	it("throws an owned error to the boundary that claims it, with its type", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "signed-out");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		expect(screen.getByText("Sign in again (expired)")).toBeDefined();
		cleanup();
	});

	it("re-throws to the parent what only the parent claims", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "offline");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		expect(screen.getByText("You are offline")).toBeDefined();
		cleanup();
	});

	it("passes an error no boundary claims to the app's own boundary", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "missing");
		function Throwing(props: {
			readonly handle: QueryHandle<typeof test.issueQuery>;
		}) {
			const [issuePromise] = useQuery(test.issueQuery, props.handle, {
				throwOnError: true,
			});
			const issue = use(issuePromise);
			return <p>{issue.title}</p>;
		}
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<Throwing handle={handle} />));
		await settle();
		expect(screen.getByText(/^Outer: IssueNotFound/)).toBeDefined();
		cleanup();
	});

	it("refetches on reset", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "signed-out");
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(test.view(<test.Title handle={handle} />));
		await settle();
		test.backend.outcomes.set(1, "found");
		await act(async () => {
			screen.getByText("Sign in again (expired)").click();
		});
		await settle();
		expect(screen.getByText("Issue 1")).toBeDefined();
		cleanup();
	});

	it("gives each boundary's reads of one query their own outcome", async () => {
		const test = setup();
		test.backend.outcomes.set(1, "offline");
		function OfflineTitle(props: {
			readonly handle: QueryHandle<typeof test.issueQuery>;
		}) {
			const [issuePromise] = useQuery(test.issueQuery, props.handle, {
				throwOnError: useOfflineBoundary(),
			});
			expectTypeOf(issuePromise).toEqualTypeOf<
				Thenable<
					Result.Result<
						{ id: number; title: string },
						IssueNotFound | Unauthorized
					>
				>
			>();
			use(issuePromise);
			return <p>offline read</p>;
		}
		const handle = test.client.prefetch(test.issueQuery, { id: 1 });
		await mount(
			<QueryClientProvider client={test.client}>
				<OfflineBoundary>
					<Suspense fallback={<p>Loading</p>}>
						<OfflineTitle handle={handle} />
					</Suspense>
				</OfflineBoundary>
				<Outer>
					<Suspense fallback={<p>Loading</p>}>
						<MatchOffline handle={handle} />
					</Suspense>
				</Outer>
			</QueryClientProvider>,
		);
		await settle();
		expect(screen.getByText("You are offline")).toBeDefined();
		expect(screen.getByText("inline: Offline")).toBeDefined();
		cleanup();

		function MatchOffline(props: {
			readonly handle: QueryHandle<typeof test.issueQuery>;
		}) {
			const [issuePromise] = useQuery(test.issueQuery, props.handle);
			return (
				<p>
					{Result.match(use(issuePromise), {
						onFailure: (error) => `inline: ${error._tag}`,
						onSuccess: (issue) => issue.title,
					})}
				</p>
			);
		}
	});

	it("routes a promise query's declared errors", async () => {
		const client = new QueryClient({ isServer: false });
		function sessionQuery() {
			return queryOptions({
				errors: errorTypes(Unauthorized, IssueNotFound),
				queryFn: () =>
					Promise.reject(new Unauthorized({ reason: "no session" })),
				queryKey: ["session"],
				retry: false,
			});
		}
		function Session(props: {
			readonly handle: QueryHandle<typeof sessionQuery>;
		}) {
			const [sessionPromise] = useQuery(sessionQuery, props.handle, {
				throwOnError: useAuthBoundary(),
			});
			expectTypeOf(sessionPromise).toEqualTypeOf<
				Thenable<Result.Result<never, IssueNotFound>>
			>();
			use(sessionPromise);
			return <p>signed in</p>;
		}
		const handle = client.prefetch(sessionQuery);
		await mount(
			<QueryClientProvider client={client}>
				<OfflineBoundary>
					<AuthBoundary>
						<Suspense fallback={<p>Loading</p>}>
							<Session handle={handle} />
						</Suspense>
					</AuthBoundary>
				</OfflineBoundary>
			</QueryClientProvider>,
		);
		await settle();
		expect(screen.getByText("Sign in again (no session)")).toBeDefined();
		cleanup();
	});

	it("throws from the hook outside its boundary, and from a boundary outside its parent", async () => {
		function Lonely() {
			useAuthBoundary();
			return null;
		}
		await mount(
			<Outer>
				<Lonely />
			</Outer>,
		);
		expect(
			screen.getByText(
				"Outer: Error: The Auth error boundary's hook found no <AuthBoundary> above it: wrap the tree in <AuthBoundary>",
			),
		).toBeDefined();
		cleanup();

		await mount(
			<Outer>
				<AuthBoundary>{null}</AuthBoundary>
			</Outer>,
		);
		expect(
			screen.getByText(
				"Outer: Error: <AuthBoundary> needs <OfflineBoundary>, its parent, above it",
			),
		).toBeDefined();
		cleanup();
	});

	it("only takes claims on reads with a typed error", () => {
		function plainQuery() {
			return queryOptions({
				queryFn: () => Promise.resolve("a"),
				queryKey: ["plain"],
			});
		}
		function useTypeOnly(handle: QueryHandle<typeof plainQuery>) {
			const auth = useAuthBoundary();
			// @ts-expect-error a promise queryFn without declared errors always throws
			useQuery(plainQuery, handle, { throwOnError: auth });
		}
		expect(useTypeOnly).toBeTypeOf("function");
	});
});
