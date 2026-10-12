import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Context, Effect, Layer } from "effect";
import { Component, type ReactNode, Suspense, use } from "react";

import {
	type EnsuredQueryHandle,
	infiniteQueryOptions,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	type Thenable,
	useQuery,
	type UseQueryOptions,
	useWaterfall,
} from "./index.ts";

interface Issue {
	readonly assigneeId: number;
	readonly id: number;
	readonly title: string;
}

function createBackend() {
	const issues = new Map<number, Issue>([
		[1, { assigneeId: 10, id: 1, title: "First" }],
		[2, { assigneeId: 20, id: 2, title: "Second" }],
	]);
	const users = new Map([
		[10, "Ada"],
		[20, "Grace"],
	]);
	const open: Array<() => void> = [];
	let calls = 0;
	function later<T>(produce: () => T) {
		calls++;
		return new Promise<T>((resolve, reject) => {
			open.push(() => {
				try {
					resolve(produce());
				} catch (error) {
					reject(error);
				}
			});
		});
	}
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () =>
				later(() => {
					const issue = issues.get(input.id);
					if (!issue) {
						throw new Error(`No issue ${input.id}`);
					}
					return issue;
				}),
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	function userQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => later(() => users.get(input.id) ?? "nobody"),
			queryKey: ["user", input.id],
		});
	}
	return {
		calls: () => calls,
		issueQuery,
		issues,
		/** Settle every open request, then let React render the results. */
		respond: () =>
			act(async () => {
				for (const settle of open.splice(0)) {
					settle();
				}
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
			}),
		userQuery,
	};
}

class Greeting extends Context.Service<Greeting, string>()("test/Greeting") {}

function greetingQuery(input: { name: string }) {
	return queryOptions({
		queryFn: () =>
			Effect.map(
				Effect.service(Greeting),
				(greeting) => `${greeting}, ${input.name}`,
			),
		queryKey: ["greeting", input.name],
	});
}

/** Render inside an awaited `act`, so React resumes suspended trees later. */
async function mount(ui: ReactNode) {
	const result = await act(async () => render(ui));
	return {
		rerender: (next: ReactNode) =>
			act(async () => {
				result.rerender(next);
			}),
	};
}

interface BoundaryState {
	readonly error: unknown;
}

class Boundary extends Component<
	{ readonly children: ReactNode },
	BoundaryState
> {
	override state: BoundaryState = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		if (this.state.error !== null) {
			return (
				<button
					onClick={() => {
						this.setState({ error: null });
					}}
					type="button"
				>
					{`Error: ${String(this.state.error)}`}
				</button>
			);
		}
		return this.props.children;
	}
}

function setup() {
	const backend = createBackend();
	const client = new QueryClient({ isServer: false });
	function IssueTitle(props: {
		readonly handle: QueryHandle<typeof backend.issueQuery>;
		readonly options?: UseQueryOptions;
	}) {
		const [issuePromise, issueState] = useQuery(
			backend.issueQuery,
			props.handle,
			props.options,
		);
		const issue = use(issuePromise);
		return (
			<p data-previous={issueState.isPrevious}>
				{issue.title}
				{issueState.isFetching ? " (fetching)" : ""}
			</p>
		);
	}
	function view(children: ReactNode) {
		return (
			<QueryClientProvider client={client}>
				<Boundary>
					<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
				</Boundary>
			</QueryClientProvider>
		);
	}
	return { backend, client, IssueTitle, view };
}

describe("useQuery", () => {
	it("suspends until a prefetched query resolves", async () => {
		const test = setup();
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();

		expect(screen.getByText("First")).toBeDefined();
		expect(test.backend.calls()).toBe(1);
		cleanup();
	});

	it("renders cached data without suspending, and re-renders on setData", async () => {
		const test = setup();
		test.client.setData(
			test.backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 10,
				id: 1,
				title: "Cached",
			},
		);
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Cached (fetching)")).toBeDefined();

		await test.backend.respond();
		expect(screen.getByText("First")).toBeDefined();

		await act(async () => {
			test.client.setData(test.backend.issueQuery, { id: 1 }, (issue) => ({
				assigneeId: 10,
				id: 1,
				title: `${issue?.title}!`,
			}));
			await Promise.resolve();
		});
		expect(screen.getByText("First!")).toBeDefined();
		cleanup();
	});

	it("suspends on a new input by default", async () => {
		const test = setup();
		const first = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(test.view(<test.IssueTitle handle={first} />));

		const second = test.client.prefetch(test.backend.issueQuery, { id: 2 });
		await result.rerender(test.view(<test.IssueTitle handle={second} />));

		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("Second")).toBeDefined();
		cleanup();
	});

	it("keeps the previous input's data with whilePending: previous", async () => {
		const test = setup();
		const options: UseQueryOptions = { whilePending: "previous" };
		const first = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(
			test.view(<test.IssueTitle handle={first} options={options} />),
		);

		const second = test.client.prefetch(test.backend.issueQuery, { id: 2 });
		await result.rerender(
			test.view(<test.IssueTitle handle={second} options={options} />),
		);

		const previous = screen.getByText("First (fetching)");
		expect(previous.dataset["previous"]).toBe("true");
		await test.backend.respond();
		expect(screen.getByText("Second").dataset["previous"]).toBe("false");
		cleanup();
	});

	it("throws a failed first load to the error boundary, and refetches on reset", async () => {
		const test = setup();
		test.backend.issues.delete(1);
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await mount(test.view(<test.IssueTitle handle={handle} />));

		await test.backend.respond();
		const reset = await screen.findByText("Error: Error: No issue 1");

		test.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Back" });
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		await act(async () => {
			reset.click();
		});
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("Back")).toBeDefined();
		cleanup();
	});

	it("exposes paging controls for paged factories", async () => {
		const client = new QueryClient({ isServer: false });
		function numbersQuery() {
			return infiniteQueryOptions({
				getNextPageParam: (lastPage: number) =>
					lastPage < 3 ? lastPage + 1 : null,
				initialPageParam: 1,
				queryFn: (context) => context.pageParam,
				queryKey: ["numbers"],
			});
		}
		function Numbers(props: {
			readonly handle: EnsuredQueryHandle<typeof numbersQuery>;
		}) {
			const [data, numbers] = useQuery(numbersQuery, props.handle);
			return (
				<button
					disabled={!numbers.hasNextPage}
					onClick={() => {
						void numbers.fetchNextPage();
					}}
					type="button"
				>
					{data.pages.join(",")}
				</button>
			);
		}
		const handle = await client.ensure(numbersQuery);
		await mount(
			<QueryClientProvider client={client}>
				<Numbers handle={handle} />
			</QueryClientProvider>,
		);

		await act(async () => {
			screen.getByText("1").click();
		});
		await waitFor(() => screen.getByText("1,2"));
		await act(async () => {
			screen.getByText("1,2").click();
		});
		const button = await screen.findByText("1,2,3");
		expect(button.hasAttribute("disabled")).toBe(true);
		cleanup();
	});

	it("re-renders only for the controls a component reads", async () => {
		const test = setup();
		const renders = { all: 0, promiseOnly: 0 };
		function PromiseOnly(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			renders.promiseOnly++;
			const [issuePromise] = useQuery(test.backend.issueQuery, props.handle);
			return <p>{use(issuePromise).title}</p>;
		}
		function ReadsFetching(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			renders.all++;
			const [issuePromise, issueState] = useQuery(
				test.backend.issueQuery,
				props.handle,
			);
			const issue = use(issuePromise);
			return <p>{`${issue.title}${issueState.isFetching ? "…" : ""}`}</p>;
		}
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		await mount(
			test.view(
				<>
					<PromiseOnly handle={handle} />
					<ReadsFetching handle={handle} />
				</>,
			),
		);
		expect(renders).toEqual({ all: 1, promiseOnly: 1 });

		await act(async () => {
			void test.client.invalidate(test.backend.issueQuery, { id: 1 });
			await Promise.resolve();
		});
		expect(screen.getByText("First…")).toBeDefined();
		expect(renders).toEqual({ all: 2, promiseOnly: 1 });

		test.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Renamed" });
		await test.backend.respond();
		expect(screen.getAllByText("Renamed")).toHaveLength(2);
		expect(renders).toEqual({ all: 3, promiseOnly: 2 });
		cleanup();
	});

	it("doesn't re-render for retries of a background refetch", async () => {
		const client = new QueryClient({ isServer: false });
		let attempt = 0;
		function flakyQuery() {
			return queryOptions({
				queryFn: async () => {
					attempt++;
					if (attempt > 1 && attempt < 4) {
						throw new Error("flaky");
					}
					return attempt;
				},
				queryKey: ["flaky"],
				retry: 3,
				retryDelay: 1,
			});
		}
		const renders = { count: 0 };
		function Value(props: {
			readonly handle: EnsuredQueryHandle<typeof flakyQuery>;
		}) {
			renders.count++;
			const [value] = useQuery(flakyQuery, props.handle);
			return <p>{`Value ${value}`}</p>;
		}
		const handle = await client.ensure(flakyQuery);
		await mount(
			<QueryClientProvider client={client}>
				<Value handle={handle} />
			</QueryClientProvider>,
		);

		await act(async () => {
			await client.invalidate(flakyQuery);
		});
		expect(screen.getByText("Value 4")).toBeDefined();
		expect(renders.count).toBe(2);
		cleanup();
	});

	it("returns the data itself for a handle from ensure", async () => {
		const test = setup();
		function EnsuredTitle(props: {
			readonly handle: EnsuredQueryHandle<typeof test.backend.issueQuery>;
		}) {
			const [issue] = useQuery(test.backend.issueQuery, props.handle);
			return <p>{issue.title}</p>;
		}
		const ensuring = test.client.ensure(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const handle = await ensuring;

		await mount(test.view(<EnsuredTitle handle={handle} />));
		expect(screen.getByText("First")).toBeDefined();

		// The entry lost its data after the loader ran: the hook suspends.
		await act(async () => {
			void test.client.reset(test.backend.issueQuery, { id: 1 });
			await Promise.resolve();
		});
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("First")).toBeDefined();
		cleanup();
	});

	it("returns undefined data without suspending", async () => {
		const test = setup();
		function assigneeQuery() {
			return queryOptions({
				queryFn: (): Promise<string | undefined> => Promise.resolve(undefined),
				queryKey: ["assignee"],
				staleTime: Infinity,
			});
		}
		function Assignee(props: {
			readonly handle: EnsuredQueryHandle<typeof assigneeQuery>;
		}) {
			const [name] = useQuery(assigneeQuery, props.handle);
			return <p>{name ?? "Unassigned"}</p>;
		}
		const handle = await test.client.ensure(assigneeQuery);

		await mount(test.view(<Assignee handle={handle} />));

		expect(screen.getByText("Unassigned")).toBeDefined();
		cleanup();
	});

	it("types reads of ensured handles as data", () => {
		const backend = createBackend();
		expectTypeOf<EnsuredQueryHandle<typeof backend.issueQuery>>().not.toExtend<
			QueryHandle<typeof backend.issueQuery>
		>();
		const ensure = (client: QueryClient) =>
			client.ensure(backend.issueQuery, { id: 1 });
		expectTypeOf(ensure).returns.resolves.toEqualTypeOf<
			EnsuredQueryHandle<typeof backend.issueQuery>
		>();
		const useTypes = (
			ensured: EnsuredQueryHandle<typeof backend.issueQuery>,
			handle: QueryHandle<typeof backend.issueQuery>,
		) => {
			const [issue] = useQuery(backend.issueQuery, ensured);
			expectTypeOf(issue).toEqualTypeOf<Issue>();
			const [promise] = useQuery(backend.issueQuery, handle);
			expectTypeOf(promise).toEqualTypeOf<Thenable<Issue>>();
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("types paging controls only for paged factories", () => {
		const backend = createBackend();
		const useTypes = (handle: QueryHandle<typeof backend.issueQuery>) => {
			const [promise, controls] = useQuery(backend.issueQuery, handle);
			expectTypeOf(promise).resolves.toEqualTypeOf<Issue>();
			expectTypeOf(controls.input).toEqualTypeOf<{ id: number }>();
			// @ts-expect-error plain factories have no paging controls
			void controls.fetchNextPage;
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("starts a request with the client's layer services during render", async () => {
		const client = new QueryClient({
			isServer: false,
			layer: Layer.succeed(Greeting, "Hello"),
		});
		function Greet(props: {
			readonly handle: QueryHandle<typeof greetingQuery>;
		}) {
			const [greetingPromise] = useQuery(greetingQuery, props.handle);
			return <p>{use(greetingPromise)}</p>;
		}

		await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Greet
						handle={{ input: { name: "Ada" }, key: ["greeting", "Ada"] }}
					/>
				</Suspense>
			</QueryClientProvider>,
		);

		await waitFor(() => screen.getByText("Hello, Ada"));
		expect(screen.queryByText("Loading")).toBeNull();
		cleanup();
	});
});

describe("useWaterfall", () => {
	it("starts a query whose input comes from another query's data", async () => {
		const test = setup();
		function Assignee(props: { readonly issue: Issue }) {
			const user = useWaterfall(test.backend.userQuery, {
				id: props.issue.assigneeId,
			});
			const [userPromise] = useQuery(test.backend.userQuery, user);
			return <p>{`Assignee: ${use(userPromise)}`}</p>;
		}
		function IssuePage(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			const [issuePromise] = useQuery(test.backend.issueQuery, props.handle);
			return <Assignee issue={use(issuePromise)} />;
		}
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 2 });

		await mount(test.view(<IssuePage handle={handle} />));
		await test.backend.respond();
		await test.backend.respond();

		expect(screen.getByText("Assignee: Grace")).toBeDefined();
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});
});
