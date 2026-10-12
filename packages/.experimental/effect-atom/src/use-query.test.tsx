import { cleanup, screen, waitFor } from "@testing-library/react";
import { Cause } from "effect";
import { AsyncResult } from "effect/reactivity";
import { type ReactNode, Suspense, use } from "react";
import { describe, expect, test } from "vitest";

import { QueryClient } from "./client.ts";
import {
	type EnsuredQueryHandle,
	infiniteQueryOptions,
	type QueryHandle,
} from "./options.ts";
import { QueryClientProvider } from "./provider.tsx";
import { Boundary, createBackend, flush, mount } from "./test-utils.tsx";
import { useQuery, type UseQueryOptions } from "./use-query.ts";

/** A backend, a client, and an `<Issue>` that shows one issue's title. */
function setup(client = new QueryClient({ isServer: false })) {
	cleanup();
	const backend = createBackend();
	function Issue(props: { readonly id: number }) {
		const [promise, state] = useQuery(backend.issueQuery, {
			input: { id: props.id },
			key: ["issue", props.id],
		});
		const issue = use(promise);
		return (
			<button
				onClick={() => {
					void state.refetch();
				}}
				type="button"
			>
				{`${issue.title}${state.isFetching ? " (fetching)" : ""}`}
			</button>
		);
	}
	function IssueTitle(props: {
		readonly handle: QueryHandle<typeof backend.issueQuery>;
		readonly options?: UseQueryOptions;
	}) {
		const [promise, state] = useQuery(
			backend.issueQuery,
			props.handle,
			props.options,
		);
		const issue = use(promise);
		return (
			<p data-previous={state.isPrevious}>
				{issue.title}
				{state.isFetching ? " (fetching)" : ""}
			</p>
		);
	}
	function view(ui: ReactNode) {
		return (
			<QueryClientProvider client={client}>
				<Boundary>
					<Suspense fallback={<p>Loading</p>}>{ui}</Suspense>
				</Boundary>
			</QueryClientProvider>
		);
	}
	return {
		backend,
		client,
		Issue,
		IssueTitle,
		view,
		/** Mount `ui` under a provider, an error boundary and a Suspense fallback. */
		render: (ui: ReactNode) => mount(view(ui)),
	};
}

function text() {
	return document.body.textContent;
}

function focusWindow() {
	return flush(() => {
		globalThis.dispatchEvent(new Event("visibilitychange"));
	});
}

describe("useQuery", () => {
	test("suspends until the first data, then renders it", async () => {
		const t = setup();
		await t.render(<t.Issue id={1} />);
		expect(text()).toBe("Loading");
		expect(t.backend.calls()).toBe(1);
		await t.backend.respond();
		expect(text()).toBe("First");
	});

	test("an ensured handle returns the data", async () => {
		const t = setup();
		const ensured = t.client.ensure(t.backend.issueQuery, { id: 2 });
		await t.backend.respond();
		const handle = await ensured;
		function Title() {
			const [issue] = useQuery(t.backend.issueQuery, handle);
			return <p>{issue.title}</p>;
		}
		await t.render(<Title />);
		expect(text()).toBe("Second");
		expect(t.backend.calls()).toBe(1);
	});

	test("setData re-renders without suspending", async () => {
		const t = setup();
		t.client.setData(
			t.backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 1,
				id: 1,
				title: "Seeded",
			},
		);
		await t.render(<t.Issue id={1} />);
		expect(text()).toBe("Seeded");
		await flush(() => {
			t.client.setData(t.backend.issueQuery, { id: 1 }, (previous) => ({
				assigneeId: 1,
				id: 1,
				title: `${previous?.title}!`,
			}));
		});
		expect(text()).toBe("Seeded!");
		expect(t.backend.calls()).toBe(0);
	});

	test("a refetch keeps the data on screen", async () => {
		const t = setup();
		await t.render(<t.Issue id={1} />);
		await t.backend.respond();
		t.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Edited" });
		await flush(() => {
			screen.getByRole("button").click();
		});
		expect(text()).toBe("First (fetching)");
		await t.backend.respond();
		expect(text()).toBe("Edited");
	});

	test("invalidate refetches what's on screen", async () => {
		const t = setup();
		await t.render(<t.Issue id={1} />);
		await t.backend.respond();
		t.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Edited" });
		const invalidated = t.client.invalidate(t.backend.issueQuery, { id: 1 });
		await t.backend.respond();
		await invalidated;
		expect(text()).toBe("Edited");
		expect(t.backend.calls()).toBe(2);
	});

	test("a first-load error reaches the boundary, and a reset retries", async () => {
		const t = setup();
		await t.render(<t.Issue id={3} />);
		await t.backend.respond();
		expect(text()).toBe("Error: Error: No issue 3");
		t.backend.issues.set(3, { assigneeId: 10, id: 3, title: "Third" });
		await flush(() => {
			screen.getByRole("button").click();
		});
		expect(text()).toBe("Loading");
		expect(t.backend.calls()).toBe(2);
		await t.backend.respond();
		expect(text()).toBe("Third");
	});

	test("controls.result renders without suspending", async () => {
		const t = setup();
		function Status() {
			const [, state] = useQuery(t.backend.issueQuery, {
				input: { id: 3 },
				key: ["issue", 3],
			});
			return (
				<p>
					{AsyncResult.match(state.result, {
						onFailure: (failure) =>
							`failed: ${String(Cause.squash(failure.cause))}`,
						onInitial: () => "loading",
						onSuccess: (success) => success.value.title,
					})}
				</p>
			);
		}
		await t.render(<Status />);
		expect(text()).toBe("loading");
		await t.backend.respond();
		expect(text()).toBe("failed: Error: No issue 3");
	});

	test("refetches stale data on window focus", async () => {
		const t = setup();
		await t.render(<t.Issue id={1} />);
		await t.backend.respond();
		await focusWindow();
		expect(t.backend.calls()).toBe(2);
		expect(text()).toBe("First (fetching)");
		await t.backend.respond();
		expect(text()).toBe("First");
	});

	test("fresh data isn't refetched on focus", async () => {
		const t = setup(
			new QueryClient({ defaults: { staleTime: Infinity }, isServer: false }),
		);
		await t.render(<t.Issue id={1} />);
		await t.backend.respond();
		await focusWindow();
		expect(t.backend.calls()).toBe(1);
	});

	test("unmounting releases the query, keeping its data until gcTime", async () => {
		const t = setup();
		await t.render(<t.Issue id={1} />);
		await t.backend.respond();
		cleanup();
		await flush();
		const entry = t.client.effect.getQueryUnsafe(t.backend.issueQuery, {
			id: 1,
		});
		const node = t.client.registry.getNodes().get(entry.data);
		expect(node?.listeners.size).toBe(0);
		expect(t.client.getData(t.backend.issueQuery, { id: 1 })?.title).toBe(
			"First",
		);
	});

	test("suspends on a new input by default", async () => {
		const t = setup();
		const first = t.client.prefetch(t.backend.issueQuery, { id: 1 });
		await t.backend.respond();
		const result = await mount(t.view(<t.IssueTitle handle={first} />));

		const second = t.client.prefetch(t.backend.issueQuery, { id: 2 });
		await result.rerender(t.view(<t.IssueTitle handle={second} />));

		expect(screen.getByText("Loading")).toBeDefined();
		await t.backend.respond();
		expect(screen.getByText("Second")).toBeDefined();
	});

	test("keeps the previous input's data with whilePending: previous", async () => {
		const t = setup();
		const options: UseQueryOptions = { whilePending: "previous" };
		const first = t.client.prefetch(t.backend.issueQuery, { id: 1 });
		await t.backend.respond();
		const result = await mount(
			t.view(<t.IssueTitle handle={first} options={options} />),
		);

		const second = t.client.prefetch(t.backend.issueQuery, { id: 2 });
		await result.rerender(
			t.view(<t.IssueTitle handle={second} options={options} />),
		);

		const previous = screen.getByText("First (fetching)");
		expect(previous.dataset["previous"]).toBe("true");
		await t.backend.respond();
		expect(screen.getByText("Second").dataset["previous"]).toBe("false");
	});

	test("exposes paging controls for paged factories", async () => {
		cleanup();
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
					{numbers.isFetchingNextPage ? "…" : ""}
				</button>
			);
		}
		const handle = await client.ensure(numbersQuery);
		await mount(
			<QueryClientProvider client={client}>
				<Numbers handle={handle} />
			</QueryClientProvider>,
		);

		await flush(() => {
			screen.getByText("1").click();
		});
		await waitFor(() => screen.getByText("1,2"));
		await flush(() => {
			screen.getByText("1,2").click();
		});
		const button = await screen.findByText("1,2,3");
		expect(button.hasAttribute("disabled")).toBe(true);
	});
});
