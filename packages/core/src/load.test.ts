import { QueryDevtoolsPanel } from "@raf-query/react/devtools";
import { screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	ensureEntry,
	fetchEntry,
	getData,
	invalidateOne,
	isFail,
	isQueryFailure,
	load,
	prefetchEntry,
	queryOptions,
	waterfallHandle,
} from "./index.ts";
import {
	advance,
	createBackend,
	issues,
	mount,
	read,
	testClient,
} from "./test-utils.ts";

describe("load", () => {
	it("starts every entry before it waits for any, and hands back handles and data", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			first: fetchEntry(backend.issueQuery, { id: 1 }),
			second: ensureEntry(backend.issueQuery, { id: 2 }),
			third: prefetchEntry(backend.issueQuery, { id: 3 }),
		});

		expect(backend.requests.map((request) => request.id)).toEqual([1, 2, 3]);
		await backend.respondAll();
		const [handles, data] = await loading;

		expect(data).toEqual({
			first: { author: "ada", id: 1, title: "First" },
			second: { author: "bob", id: 2, title: "Second" },
		});
		expect(handles).toEqual({
			first: {
				defined: true,
				input: { id: 1 },
				queryKey: issues("byId", { id: 1 }),
			},
			second: {
				defined: true,
				input: { id: 2 },
				queryKey: issues("byId", { id: 2 }),
			},
			third: { input: { id: 3 }, queryKey: issues("byId", { id: 3 }) },
		});
		expect(structuredClone(handles)).toEqual(handles);
	});

	it("shares one request between loads of the same query, however its input was built", async () => {
		const client = testClient();
		const gate = Promise.withResolvers<void>();
		let calls = 0;
		const byOwner = (input: {
			readonly owner: string;
			readonly repo: string;
		}) =>
			queryOptions({
				queryFn: async () => {
					calls += 1;
					await gate.promise;
					return `${input.owner}/${input.repo}`;
				},
				queryKey: issues("repo", input),
			});
		const bare = Object.assign(
			// SAFETY: `Object.assign` gives it both fields.
			Object.create(null) as { owner: string; repo: string },
			{ owner: "ada", repo: "raf" },
		);
		const loads = Promise.all([
			load(client, {
				repo: fetchEntry(byOwner, { owner: "ada", repo: "raf" }),
			}),
			load(client, {
				// oxlint-disable-next-line perfectionist/sort-objects -- the other field order
				repo: ensureEntry(byOwner, { repo: "raf", owner: "ada" }),
			}),
			load(client, { repo: ensureEntry(byOwner, bare) }),
		]);
		gate.resolve();
		const values = (await loads).map(([, data]) => data.repo);

		expect(calls).toBe(1);
		expect(values).toEqual(["ada/raf", "ada/raf", "ada/raf"]);
	});

	it("uses fresh data, and refetches stale data for fetch entries", async () => {
		const backend = createBackend();
		const client = testClient({ staleTime: 1000 });
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		await load(client, { issue: fetchEntry(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);
		advance(client, 1000);
		backend.store.set(1, { author: "ada", id: 1, title: "Renamed" });
		const second = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		const [, data] = await second;

		expect(data.issue.title).toBe("Renamed");
	});

	it("takes a query's own staleTime over the client's", async () => {
		const backend = createBackend();
		const client = testClient({ staleTime: 1000 });
		const brief = (input: { readonly id: number }) => ({
			...backend.issueQuery(input),
			staleTime: 0,
		});
		const first = load(client, { issue: fetchEntry(brief, { id: 1 }) });
		await backend.respondAll();
		await first;
		void load(client, { issue: fetchEntry(brief, { id: 1 }) });

		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
	});

	it("resolves ensure entries with stale data at once, and revalidates them", async () => {
		const backend = createBackend();
		const client = testClient();
		const first = load(client, {
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		backend.store.set(1, { author: "ada", id: 1, title: "Renamed" });

		const [, data] = await load(client, {
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
		});
		expect(data.issue.title).toBe("First");
		await backend.respondAll();
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe(
			"Renamed",
		);
	});

	it("rejects with a QueryFailure when a query returns fail()", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			missing: fetchEntry(backend.issueQuery, { id: 9 }),
			other: prefetchEntry(backend.issueQuery, { id: 1 }),
		}).catch((error: unknown) => error);
		await backend.respondAll();
		const failure = await loading;

		expect(isQueryFailure(failure)).toBe(true);
		expect(isFail(failure, "NotFound")).toBe(true);
		expect(isFail(failure, "Other")).toBe(false);
		expect(String(failure)).toBe(
			'QueryFailure: Query ["issues","byId",{"id":9}] failed: NotFound',
		);
	});

	it("rejects with the error itself when a query throws", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
		});
		const defect = new Error("down");
		backend.requests[0]?.fail(defect);

		await expect(loading).rejects.toBe(defect);
		expect(isFail(defect)).toBe(false);
	});

	it("never rejects for a failed prefetch entry", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: prefetchEntry(backend.issueQuery, { id: 1 }),
		});
		backend.requests[0]?.fail(new Error("down"));

		await expect(loading).resolves.toBeDefined();
	});

	it("rejects for a disabled query it has to wait for, and skips it in a prefetch", async () => {
		let calls = 0;
		const client = testClient();
		const disabled = () =>
			queryOptions({
				enabled: false,
				queryFn: () => {
					calls += 1;
					return 1;
				},
				queryKey: issues("disabled"),
			});

		await expect(load(client, { value: fetchEntry(disabled) })).rejects.toThrow(
			'Query ["issues","disabled"] is disabled',
		);
		await load(client, { value: prefetchEntry(disabled) });
		expect(calls).toBe(0);
	});

	it("doesn't revalidate data the server already has", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		await load(client, {
			ensured: ensureEntry(backend.issueQuery, { id: 1 }),
			prefetched: prefetchEntry(backend.issueQuery, { id: 1 }),
		});

		expect(backend.requests).toHaveLength(0);
	});

	it("reuses a server request's data in a fetch entry until a write invalidates it", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		advance(client, 60_000);
		await load(client, { issue: fetchEntry(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);
		await invalidateOne(client, backend.issueQuery, { id: 1 });
		const after = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		await after;
	});

	it("applies select to the data it resolves", async () => {
		const client = testClient();
		const titled = () =>
			queryOptions({
				queryFn: () => ({ title: "hello" }),
				queryKey: issues("titled"),
				select: (issue) => issue.title.toUpperCase(),
			});
		const [, data] = await load(client, { title: fetchEntry(titled) });

		expect(data.title).toBe("HELLO");
		expect(getData(client, titled)).toEqual({ title: "hello" });
	});

	it("fetches as many pages as a paged entry asks for, stopping at the last", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			few: fetchEntry(backend.pageQuery, { size: 2 }, { pages: 2 }),
			many: ensureEntry(backend.pageQuery, { size: 5 }, { pages: 9 }),
		});
		for (let round = 0; round < 3; round++) {
			await backend.respondAll();
		}
		const [, data] = await loading;

		expect(data.few).toEqual({
			pageParams: [0, 2],
			pages: [
				[0, 1],
				[2, 3],
			],
		});
		expect(data.many.pageParams).toEqual([0, 5]);
	});

	it("shows its latest loads in the devtools, in development only", async () => {
		const backend = createBackend();
		const client = testClient();
		mount(client, createElement(QueryDevtoolsPanel));
		const loading = load(client, {
			issue: prefetchEntry(backend.issueQuery, { id: 1 }),
			title: ensureEntry(backend.draftQuery, { id: 2 }),
		});
		await backend.respondAll();
		await loading;

		expect(screen.getByText("issue (prefetch), title (ensure)")).toBeDefined();
		vi.stubEnv("NODE_ENV", "production");
		const quiet = testClient();
		await load(quiet, { issue: prefetchEntry(backend.issueQuery, { id: 1 }) });
		await backend.respondAll();
		const panel = mount(quiet, createElement(QueryDevtoolsPanel));
		expect(panel.container.textContent).toContain("Loads");
		expect(panel.container.textContent).not.toContain("(prefetch)");
	});
});

describe("waterfallHandle", () => {
	it("makes a handle whose reader fetches it while rendering, without a warning", async () => {
		const backend = createBackend();
		const client = testClient();
		const warn = vi.spyOn(console, "warn");
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });
		const view = read(client, backend.issueQuery, handle);

		expect(handle).toEqual({
			input: { id: 1 },
			queryKey: issues("byId", { id: 1 }),
		});
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		expect(view.result.current[0]).toMatchObject({
			status: "fulfilled",
			value: { title: "First" },
		});
		expect(warn).not.toHaveBeenCalled();
	});

	it("keeps the handle while a new input maps to the same query", () => {
		const backend = createBackend();
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });

		expect(waterfallHandle(backend.issueQuery, handle, { id: 1 })).toBe(handle);
		expect(
			waterfallHandle(backend.issueQuery, handle, { id: 2 }).input,
		).toEqual({
			id: 2,
		});
	});
});
