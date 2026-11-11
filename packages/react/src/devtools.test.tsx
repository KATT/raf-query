import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueryDevtools, QueryDevtoolsPanel } from "./devtools.tsx";
import {
	load,
	prefetch,
	QueryClientProvider,
	resetOne,
	revalidate,
	setData,
	useQuery,
	waterfallHandle,
} from "./index.ts";
import {
	createBackend,
	flush,
	issues,
	queryOptions,
	testClient,
} from "./test-utils.tsx";

async function loadedClient() {
	const backend = createBackend();
	const client = testClient();
	const done = load(client, {
		issue: revalidate(backend.issueQuery, { id: 1 }),
		later: prefetch(backend.issueQuery, { id: 2 }),
	});
	backend.requests.splice(0, 1)[0]?.respond();
	await done;
	return { backend, client };
}

describe("QueryDevtoolsPanel", () => {
	it("lists entries and loads, and acts on the selected entry", async () => {
		const loaded = await loadedClient();
		const client = loaded.client;
		const backend = loaded.backend;
		const failing = () =>
			queryOptions({
				queryFn: async () => {
					throw new Error("nope");
				},
				queryKey: issues("failing"),
			});
		await load(client, { failing: prefetch(failing) });
		await flush();
		const onClose = vi.fn();
		render(<QueryDevtoolsPanel client={client} onClose={onClose} />);
		expect(screen.getByText("Queries (3)")).toBeTruthy();
		expect(screen.getAllByText("inactive")).toHaveLength(1);
		expect(screen.getAllByText("fetching")).toHaveLength(1);
		expect(screen.getAllByText("error")).toHaveLength(1);
		expect(
			screen.getByText(/^issue \(revalidate\), later \(prefetch\)$/u),
		).toBeTruthy();
		expect(screen.getByText("Select a query")).toBeTruthy();

		fireEvent.click(screen.getByText(/byId.*"id":1/u));
		expect(screen.getByText(/"title": "First"/u)).toBeTruthy();
		expect(screen.getByText(/^Updated: \d/u)).toBeTruthy();
		await act(async () => {
			fireEvent.click(screen.getByText("Refetch"));
			await flush();
		});
		expect(backend.requests).toHaveLength(2);
		await act(async () => {
			fireEvent.click(screen.getByText("Reset"));
			await flush();
		});
		expect(screen.getByText("Updated: never")).toBeTruthy();
		await act(async () => {
			fireEvent.click(screen.getByText("Remove"));
			await flush();
		});
		expect(screen.getByText("Queries (2)")).toBeTruthy();
		fireEvent.click(screen.getByText("Close"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("labels pending and read entries", async () => {
		const loaded = await loadedClient();
		const client = loaded.client;
		const backend = loaded.backend;
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });
		function Issue() {
			useQuery(backend.issueQuery, handle);
			return null;
		}
		await act(async () => {
			backend.requests.splice(0)[0]?.fail(new Error("gone"));
			await flush();
		});
		const pendingQuery = () =>
			queryOptions({ queryFn: async () => 1, queryKey: issues("idle") });
		setData(client, pendingQuery, 1);
		await resetOne(client, pendingQuery);
		render(
			<QueryClientProvider client={client}>
				<Issue />
				<QueryDevtoolsPanel />
			</QueryClientProvider>,
		);
		expect(screen.getByText("active")).toBeTruthy();
		expect(screen.getByText("pending")).toBeTruthy();
	});

	it("needs a client", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render(<QueryDevtoolsPanel />)).toThrow(/pass `client`/u);
	});
});

describe("QueryDevtools", () => {
	it("opens and closes the panel", async () => {
		const client = (await loadedClient()).client;
		render(<QueryDevtools buttonPosition="top-left" client={client} />);
		fireEvent.click(screen.getByText("raf-query"));
		expect(screen.getByText("Queries (2)")).toBeTruthy();
		fireEvent.click(screen.getByText("Close"));
		expect(screen.queryByText("Queries (2)")).toBeNull();
	});

	it("can start open", async () => {
		const client = (await loadedClient()).client;
		render(<QueryDevtools client={client} initialIsOpen />);
		expect(screen.getByText("Queries (2)")).toBeTruthy();
	});
});
