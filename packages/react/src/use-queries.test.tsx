import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Effect, Result } from "effect";
import { Component, type ReactNode, StrictMode, Suspense, use } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import {
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	type Thenable,
	useQueries,
	type UseQueryOptions,
	type UseQueryResultWithData,
} from "./index.ts";

function createBackend() {
	const titles = new Map([
		[1, "First"],
		[2, "Second"],
		[3, "Third"],
	]);
	const open: Array<() => void> = [];
	let calls = 0;
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => {
				calls++;
				return new Promise<string>((resolve, reject) => {
					open.push(() => {
						const title = titles.get(input.id);
						if (title === undefined) {
							reject(new Error(`No issue ${input.id}`));
						} else {
							resolve(title);
						}
					});
				});
			},
			queryKey: ["issue", input.id],
			retry: false,
			staleTime: 60_000,
		});
	}
	return {
		calls: () => calls,
		issueQuery,
		titles,
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
	};
}

async function mount(ui: ReactNode) {
	const result = await act(async () => render(ui));
	return {
		rerender: (next: ReactNode) =>
			act(async () => {
				result.rerender(next);
			}),
		unmount: () =>
			act(async () => {
				result.unmount();
			}),
	};
}

class Boundary extends Component<
	{ readonly children: ReactNode },
	{ readonly error: unknown }
> {
	override state = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		if (this.state.error !== null) {
			return <p>{`Error: ${String(this.state.error)}`}</p>;
		}
		return this.props.children;
	}
}

function setup() {
	const backend = createBackend();
	const client = new QueryClient({ isServer: false });
	const seen: Array<Promise<string>> = [];
	function Titles(props: {
		readonly handles: ReadonlyArray<QueryHandle<typeof backend.issueQuery>>;
		readonly options?: UseQueryOptions;
	}) {
		const reads = useQueries(backend.issueQuery, props.handles, props.options);
		const titles: Array<string> = [];
		for (const [titlePromise, state] of reads) {
			seen.push(titlePromise);
			const title = use(titlePromise);
			titles.push(
				`${title}${state.isFetching ? "*" : ""}${state.isPrevious ? "^" : ""}`,
			);
		}
		return <p>{titles.join(", ") || "None"}</p>;
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
	const prefetch = (ids: ReadonlyArray<number>) =>
		ids.map((id) => client.prefetch(backend.issueQuery, { id }));
	return { backend, client, prefetch, seen, Titles, view };
}

describe("useQueries", () => {
	it("suspends until every prefetched query resolves, and reads them in order", async () => {
		const test = setup();
		const handles = test.prefetch([2, 1]);

		await mount(test.view(<test.Titles handles={handles} />));
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();

		expect(screen.getByText("Second, First")).toBeDefined();
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});

	it("renders cached data without suspending, and keeps each promise across renders", async () => {
		const test = setup();
		const handles = test.prefetch([1, 2]);
		await test.backend.respond();

		const result = await mount(test.view(<test.Titles handles={handles} />));
		expect(screen.getByText("First, Second")).toBeDefined();
		await result.rerender(test.view(<test.Titles handles={[...handles]} />));

		expect(screen.getByText("First, Second")).toBeDefined();
		expect(test.seen).toHaveLength(4);
		expect(new Set(test.seen).size).toBe(2);
		cleanup();
	});

	it("renders an empty list without suspending", async () => {
		const test = setup();

		await mount(test.view(<test.Titles handles={[]} />));

		expect(screen.getByText("None")).toBeDefined();
		cleanup();
	});

	it("follows a list that grows and shrinks", async () => {
		const test = setup();
		const handles = test.prefetch([1, 2]);
		await test.backend.respond();
		const result = await mount(test.view(<test.Titles handles={handles} />));

		await result.rerender(
			test.view(<test.Titles handles={[...handles, ...test.prefetch([3])]} />),
		);
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("First, Second, Third")).toBeDefined();

		await result.rerender(
			test.view(<test.Titles handles={test.prefetch([3])} />),
		);
		expect(screen.getByText("Third")).toBeDefined();
		expect(test.backend.calls()).toBe(3);
		cleanup();
	});

	it("re-renders with one query's new data without suspending", async () => {
		const test = setup();
		const handles = test.prefetch([1, 2]);
		await test.backend.respond();
		await mount(test.view(<test.Titles handles={handles} />));

		await act(async () => {
			test.client.setData(test.backend.issueQuery, { id: 2 }, "Renamed");
			await Promise.resolve();
		});

		expect(screen.getByText("First, Renamed")).toBeDefined();
		cleanup();
	});

	it("gives each query its own controls", async () => {
		const test = setup();
		const handles = test.prefetch([1, 2]);
		await test.backend.respond();
		await mount(test.view(<test.Titles handles={handles} />));

		await act(async () => {
			void test.client.invalidate(test.backend.issueQuery, { id: 2 });
			await Promise.resolve();
		});
		expect(screen.getByText("First, Second*")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("First, Second")).toBeDefined();
		cleanup();
	});

	it("keeps a position's previous data with whilePending: previous", async () => {
		const test = setup();
		const options: UseQueryOptions = { whilePending: "previous" };
		const handles = test.prefetch([1, 2]);
		await test.backend.respond();
		const result = await mount(
			test.view(<test.Titles handles={handles} options={options} />),
		);

		await result.rerender(
			test.view(
				<test.Titles handles={test.prefetch([1, 3])} options={options} />,
			),
		);
		expect(screen.getByText("First, Second*^")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("First, Third")).toBeDefined();
		cleanup();
	});

	it("re-renders a component that reads the promise's status when the loads settle", async () => {
		const test = setup();
		const handles = test.prefetch([1, 2]);
		function Status() {
			const reads = useQueries(test.backend.issueQuery, handles);
			return (
				<p>
					{reads
						.map(([titlePromise]) =>
							titlePromise.status === "fulfilled" ? titlePromise.value : "…",
						)
						.join(", ")}
				</p>
			);
		}

		await mount(test.view(<Status />));
		expect(screen.getByText("…, …")).toBeDefined();
		await test.backend.respond();

		expect(screen.getByText("First, Second")).toBeDefined();
		cleanup();
	});

	it("throws a failed first load to the error boundary", async () => {
		const test = setup();
		await mount(test.view(<test.Titles handles={test.prefetch([1, 4])} />));

		await test.backend.respond();

		expect(screen.getByText("Error: Error: No issue 4")).toBeDefined();
		cleanup();
	});

	it("stops reading its queries when it unmounts", async () => {
		const test = setup();
		const handles = test.prefetch([1, 2]);
		await test.backend.respond();
		const result = await mount(
			<StrictMode>{test.view(<test.Titles handles={handles} />)}</StrictMode>,
		);

		await act(async () => {
			void test.client.invalidate(test.backend.issueQuery, { id: 1 });
			await Promise.resolve();
		});
		await test.backend.respond();
		expect(test.backend.calls()).toBe(3);
		await result.unmount();
		await act(async () => {
			void test.client.invalidate(test.backend.issueQuery, { id: 2 });
			await Promise.resolve();
		});

		expect(test.backend.calls()).toBe(3);
		cleanup();
	});

	it("returns the data itself for handles from ensure", async () => {
		const test = setup();
		const ensured = Promise.all(
			[1, 2].map((id) => test.client.ensure(test.backend.issueQuery, { id })),
		);
		await test.backend.respond();
		const handles = await ensured;
		function Titles() {
			const reads = useQueries(test.backend.issueQuery, handles);
			expectTypeOf(reads).toEqualTypeOf<
				ReadonlyArray<
					UseQueryResultWithData<typeof test.backend.issueQuery, undefined>
				>
			>();
			return <p>{reads.map(([title]) => title).join(", ")}</p>;
		}

		await mount(test.view(<Titles />));

		expect(screen.getByText("First, Second")).toBeDefined();
		cleanup();
	});

	it("maps a tuple of handles to a tuple of results, each by its own handle", async () => {
		const test = setup();
		const first = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		const ensured = test.client.ensure(test.backend.issueQuery, { id: 2 });
		await test.backend.respond();
		const second = await ensured;
		function Pair() {
			const [[firstPromise], [secondTitle]] = useQueries(
				test.backend.issueQuery,
				[first, second],
			);
			expectTypeOf(firstPromise).toEqualTypeOf<Thenable<string>>();
			expectTypeOf(secondTitle).toEqualTypeOf<string>();
			const firstTitle = use(firstPromise);
			return <p>{`${firstTitle} & ${secondTitle}`}</p>;
		}

		await mount(test.view(<Pair />));

		expect(screen.getByText("First & Second")).toBeDefined();
		cleanup();
	});

	it("streams every query's data from a server render", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		const handles = [1, 2].map((id) =>
			client.prefetch(backend.issueQuery, { id }),
		);
		function Titles() {
			const titles: Array<string> = [];
			for (const [titlePromise] of useQueries(backend.issueQuery, handles)) {
				titles.push(use(titlePromise));
			}
			return <p>{titles.join(", ")}</p>;
		}

		const stream = await renderToReadableStream(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Titles />
				</Suspense>
			</QueryClientProvider>,
		);
		await backend.respond();
		await stream.allReady;

		expect(await new Response(stream).text()).toContain("First, Second");
		expect(backend.calls()).toBe(2);
	});

	it("holds a Result per query for an Effect queryFn with throwOnError: false", async () => {
		function countQuery(input: { id: number }) {
			return queryOptions({
				queryFn: () =>
					input.id > 0 ? Effect.succeed(input.id) : Effect.fail("negative"),
				queryKey: ["count", input.id],
				retry: false,
			});
		}
		const client = new QueryClient({ isServer: false, throwOnError: false });
		const handles = [1, -1].map((id) => client.prefetch(countQuery, { id }));
		function Counts() {
			const counts: Array<Result.Result<number, string>> = [];
			for (const [countPromise] of useQueries(countQuery, handles)) {
				expectTypeOf(countPromise).toEqualTypeOf<
					Thenable<Result.Result<number, string>>
				>();
				counts.push(use(countPromise));
			}
			return (
				<p>
					{counts
						.map((count) =>
							Result.match(count, {
								onFailure: (error) => `failed: ${error}`,
								onSuccess: String,
							}),
						)
						.join(", ")}
				</p>
			);
		}

		await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Counts />
				</Suspense>
			</QueryClientProvider>,
		);
		await act(async () => {
			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
		});

		expect(screen.getByText("1, failed: negative")).toBeDefined();
		cleanup();
	});
});
