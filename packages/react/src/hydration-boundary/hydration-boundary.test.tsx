import { screen } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import { dehydrate } from "../hydration.ts";
import { HydrationBoundary as ServerHydrationBoundary } from "../index-react-server.ts";
import {
	createQueryClient,
	fetchEntry,
	getData,
	HydrationBoundary,
	load,
	prefetchEntry,
	setData,
	useQuery,
	waterfallHandle,
} from "../index.ts";
import { createBackend, renderWith, testClient } from "../test-utils.tsx";

type Backend = ReturnType<typeof createBackend>;

function Issue(props: { readonly backend: Backend; readonly id: number }) {
	const handle = waterfallHandle(props.backend.issueQuery, { id: props.id });
	const [read] = useQuery(props.backend.issueQuery, handle);
	const issue = use(read);
	return <p>{issue.title}</p>;
}

async function serverState(backend: Backend, id: number, title: string) {
	const server = createQueryClient({ isServer: true });
	const done = load(server, { issue: fetchEntry(backend.issueQuery, { id }) });
	backend.store.set(id, { id, title });
	for (const request of backend.requests.splice(0)) {
		request.respond();
	}
	await done;
	return dehydrate(server);
}

describe("HydrationBoundary", () => {
	it("writes entries the client lacks before its children render", async () => {
		const backend = createBackend();
		const state = await serverState(backend, 1, "From server");
		const client = testClient();
		await renderWith(
			client,
			<HydrationBoundary state={state}>
				<Issue backend={backend} id={1} />
			</HydrationBoundary>,
		);
		expect(screen.getByText("From server")).toBeTruthy();
		expect(backend.requests).toHaveLength(0);
	});

	it("writes newer data for entries on screen after commit", async () => {
		const backend = createBackend();
		const client = testClient();
		setData(client, backend.issueQuery, { id: 1 }, { id: 1, title: "Old" });
		const view = await renderWith(
			client,
			<HydrationBoundary state={{ entries: [] }}>
				<Issue backend={backend} id={1} />
			</HydrationBoundary>,
		);
		expect(screen.getByText("Old")).toBeTruthy();
		vi.useFakeTimers({ now: Date.now() + 1000 });
		const state = await serverState(backend, 1, "New");
		vi.useRealTimers();
		await view.rerender(
			<HydrationBoundary state={state}>
				<Issue backend={backend} id={1} />
			</HydrationBoundary>,
		);
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("New");
		expect(screen.getByText("New")).toBeTruthy();
	});

	it("needs state in the browser build", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const client = testClient();
		await expect(
			renderWith(
				client,
				<HydrationBoundary client={createQueryClient()}>
					<p />
				</HydrationBoundary>,
			),
		).rejects.toThrow(/needs `state`/u);
	});
});

describe("HydrationBoundary (react-server)", () => {
	it("sends the request client's pending entries, which resume in the browser", async () => {
		const backend = createBackend();
		const server = createQueryClient({ isServer: true });
		await load(server, {
			one: prefetchEntry(backend.issueQuery, { id: 1 }),
			two: prefetchEntry(backend.issueQuery, { id: 2 }),
		});
		const client = testClient();
		await renderWith(
			client,
			<>
				<ServerHydrationBoundary client={server}>
					<Issue backend={backend} id={1} />
				</ServerHydrationBoundary>
				<ServerHydrationBoundary
					client={server}
					options={{ filter: () => true }}
				>
					<Issue backend={backend} id={2} />
				</ServerHydrationBoundary>
			</>,
		);
		const sent = backend.requests.splice(0);
		expect(sent.map((request) => request.id)).toEqual([1, 2]);
		for (const request of sent) {
			request.respond();
		}
		await vi.waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
		expect(screen.getByText("First")).toBeTruthy();
		expect(backend.requests).toHaveLength(0);
	});

	it("writes a given state", async () => {
		const backend = createBackend();
		const state = await serverState(backend, 2, "Given");
		const client = testClient();
		await renderWith(
			client,
			<ServerHydrationBoundary state={state}>
				<Issue backend={backend} id={2} />
			</ServerHydrationBoundary>,
		);
		expect(screen.getByText("Given")).toBeTruthy();
	});
});
