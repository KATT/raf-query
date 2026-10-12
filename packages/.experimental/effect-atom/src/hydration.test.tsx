import { cleanup, screen } from "@testing-library/react";
import { Suspense, use } from "react";
import { describe, expect, test, vi } from "vitest";

import { dehydrate, hydrate, QueryClient } from "./client.ts";
import type { DehydratedState } from "./hydration.ts";
import { type QueryHandle, queryOptions } from "./options.ts";
import { QueryClientProvider } from "./provider.tsx";
import { createBackend, mount } from "./test-utils.tsx";
import { useQuery } from "./use-query.ts";

describe("dehydrate", () => {
	test("sends settled data and in-flight requests, nothing else", () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		server.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 1, id: 1, title: "A" },
		);
		server.prefetch(backend.issueQuery, { id: 2 });
		server.effect.getQueryUnsafe(backend.issueQuery, { id: 3 });

		const state = dehydrate(server);

		expect(state.queries.map((query) => query.key)).toEqual([
			["issue", 1],
			["issue", 2],
		]);
		expect(state.queries[0]).toMatchObject({ data: { title: "A" } });
		expect(state.queries[1]?.promise).toBeInstanceOf(Promise);
	});

	test("redacts errors of pending queries unless keepErrors", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		server.prefetch(backend.issueQuery, { id: 404 });

		const redacted = dehydrate(server).queries[0]?.promise;
		const kept = dehydrate(server, { keepErrors: true }).queries[0]?.promise;
		await backend.respond();

		await expect(redacted).rejects.toThrow('Query ["issue",404] failed');
		await expect(kept).rejects.toThrow("No issue 404");
	});
});

describe("hydrate", () => {
	test("keeps undefined data, even when JSON drops the field", async () => {
		const queryFn = vi.fn(() => Promise.resolve(undefined));
		function noneQuery() {
			return queryOptions({ queryFn, queryKey: ["none"], staleTime: Infinity });
		}
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		await server.fetch(noneQuery);

		// oxlint-disable-next-line unicorn/prefer-structured-clone -- structuredClone keeps `data: undefined`; JSON drops it, which is the case under test
		const sent: DehydratedState = JSON.parse(JSON.stringify(dehydrate(server)));
		expect(sent.queries[0]).not.toHaveProperty("data");
		hydrate(browser, sent);

		await expect(browser.fetch(noneQuery)).resolves.toBeUndefined();
		expect(queryFn).toHaveBeenCalledOnce();
	});

	test("writes data without fetching", () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 1, id: 1, title: "A" },
		);

		hydrate(browser, dehydrate(server));

		expect(browser.getData(backend.issueQuery, { id: 1 })?.title).toBe("A");
		expect(backend.calls()).toBe(0);
	});

	test("resumes the server's request instead of starting one", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.prefetch(backend.issueQuery, { id: 1 });

		hydrate(browser, dehydrate(server));
		browser.prefetch(backend.issueQuery, { id: 1 });
		const data = browser.fetch(backend.issueQuery, { id: 1 });

		expect(backend.calls()).toBe(1);
		await backend.respond();
		await expect(data).resolves.toMatchObject({ title: "First" });
		expect(backend.calls()).toBe(1);
	});

	test("takes a pending query's data if it settles before any read", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.prefetch(backend.issueQuery, { id: 1 });
		hydrate(browser, dehydrate(server));

		await backend.respond();

		expect(browser.getData(backend.issueQuery, { id: 1 })?.title).toBe("First");
		expect(backend.calls()).toBe(1);
	});

	test("only replaces older data", () => {
		const backend = createBackend();
		const browser = new QueryClient({ isServer: false });
		browser.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 1, id: 1, title: "New" },
		);

		hydrate(browser, {
			queries: [
				{ data: { id: 1, title: "Old" }, key: ["issue", 1], updatedAt: 1 },
				{
					data: { id: 2, title: "Newer" },
					key: ["issue", 2],
					updatedAt: Date.now() + 1,
				},
			],
		});

		expect(browser.getData(backend.issueQuery, { id: 1 })?.title).toBe("New");
		expect(browser.getData(backend.issueQuery, { id: 2 })?.title).toBe("Newer");
	});

	test("round-trips data through serializeData and deserializeData", async () => {
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		function dateQuery() {
			return queryOptions({ queryFn: () => new Date(0), queryKey: ["date"] });
		}
		await server.fetch(dateQuery);

		const state = dehydrate(server, { serializeData: JSON.stringify });
		hydrate(browser, state, {
			deserializeData: (data) => new Date(JSON.parse(String(data))),
		});

		expect(state.queries[0]?.data).toBe('"1970-01-01T00:00:00.000Z"');
		expect(browser.getData(dateQuery)?.getTime()).toBe(0);
	});

	test("streams a pending query into a suspended reader", async () => {
		cleanup();
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		const handle: QueryHandle<typeof backend.issueQuery> = server.prefetch(
			backend.issueQuery,
			{ id: 2 },
		);
		hydrate(browser, dehydrate(server));
		function Title() {
			const [promise] = useQuery(backend.issueQuery, handle);
			return <p>{use(promise).title}</p>;
		}

		await mount(
			<QueryClientProvider client={browser}>
				<Suspense fallback={<p>Loading</p>}>
					<Title />
				</Suspense>
			</QueryClientProvider>,
		);
		expect(screen.getByText("Loading")).toBeDefined();
		await backend.respond();

		expect(screen.getByText("Second")).toBeDefined();
		expect(backend.calls()).toBe(1);
	});
});
