import { cleanup, screen } from "@testing-library/react";
import { type ReactNode, Suspense, use } from "react";
import { describe, expect, test } from "vitest";

import { QueryClient } from "./client.ts";
import { QueryClientProvider } from "./provider.tsx";
import { Boundary, createBackend, flush, mount } from "./test-utils.tsx";
import { useQuery } from "./use-query.ts";

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
	return {
		backend,
		client,
		Issue,
		/** Mount `ui` under a provider, an error boundary and a Suspense fallback. */
		render: (ui: ReactNode) =>
			mount(
				<QueryClientProvider client={client}>
					<Boundary>
						<Suspense fallback={<p>Loading</p>}>{ui}</Suspense>
					</Boundary>
				</QueryClientProvider>,
			),
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
		const entry = t.client.getQuery(t.backend.issueQuery, { id: 1 });
		const node = t.client.registry.getNodes().get(entry.data);
		expect(node?.listeners.size).toBe(0);
		expect(t.client.getData(t.backend.issueQuery, { id: 1 })?.title).toBe(
			"First",
		);
	});
});
