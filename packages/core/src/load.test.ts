import { describe, expect, it, vi } from "vitest";

import { isFail, isQueryFailure } from "./fail.ts";
import {
	ensureEntry,
	fetchEntry,
	isWaterfallHandle,
	load,
	loadsOf,
	prefetchEntry,
	waterfallHandle,
} from "./load.ts";
import { queryOptions } from "./options.ts";
import {
	createBackend,
	flush,
	issues,
	testClient,
	advance,
} from "./test-utils.ts";
import { invalidateOne } from "./verbs.ts";

describe("load", () => {
	it("starts every entry before it waits for any", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			first: fetchEntry(backend.issueQuery, { id: 1 }),
			second: ensureEntry(backend.issueQuery, { id: 2 }),
			third: prefetchEntry(backend.issueQuery, { id: 3 }),
		});

		expect(backend.requests.map((request) => request.id)).toEqual([1, 2, 3]);
		backend.respondAll();
		const [handles, data] = await loading;

		expect(data).toEqual({
			first: { author: "ada", id: 1, title: "First" },
			second: { author: "bob", id: 2, title: "Second" },
		});
		expect(handles.first).toEqual({
			defined: true,
			input: { id: 1 },
			queryKey: ["issues", "byId", { id: 1 }],
		});
		expect(handles.third).toEqual({
			input: { id: 3 },
			queryKey: ["issues", "byId", { id: 3 }],
		});
	});

	it("shares one request between loads of the same query", async () => {
		const backend = createBackend();
		const client = testClient();
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		const second = load(client, {
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
		});

		expect(backend.requests).toHaveLength(1);
		backend.respondAll();
		const [[, one], [, two]] = await Promise.all([first, second]);

		expect(one.issue).toBe(two.issue);
	});

	it("uses fresh cached data, and refetches stale data for fetch entries", async () => {
		const backend = createBackend();
		const client = testClient({ staleTime: 1000 });
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		backend.respondAll();
		await first;

		await load(client, { issue: fetchEntry(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);
		advance(client, 1000);
		backend.store.set(1, { author: "ada", id: 1, title: "Renamed" });
		const second = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});

		expect(backend.requests).toHaveLength(1);
		backend.respondAll();
		const [, data] = await second;

		expect(data.issue.title).toBe("Renamed");
	});

	it("resolves ensure entries with stale data at once and revalidates them", async () => {
		const backend = createBackend();
		const client = testClient();
		const first = load(client, {
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
		});
		backend.respondAll();
		await first;

		const [, data] = await load(client, {
			issue: ensureEntry(backend.issueQuery, { id: 1 }),
		});

		expect(data.issue.title).toBe("First");
		expect(backend.requests).toHaveLength(1);
	});

	it("rejects with a QueryFailure when a query returns fail()", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			missing: fetchEntry(backend.issueQuery, { id: 9 }),
			other: prefetchEntry(backend.issueQuery, { id: 1 }),
		});
		backend.respondAll();
		const failure = await loading.catch((error: unknown) => error);

		expect(isQueryFailure(failure)).toBe(true);
		expect(isFail(failure, "NotFound")).toBe(true);
		expect(isFail(failure, "Other")).toBe(false);
	});

	it("rejects with the error itself when a query throws", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		const defect = new Error("down");
		backend.requests[0]?.fail(defect);

		await expect(loading).rejects.toBe(defect);
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

	it("rejects for a disabled query it has to wait for", async () => {
		const client = testClient();
		const disabled = () =>
			queryOptions({
				enabled: false,
				queryFn: () => 1,
				queryKey: issues("disabled"),
			});

		await expect(load(client, { value: fetchEntry(disabled) })).rejects.toThrow(
			/disabled/,
		);
		await expect(
			load(client, { value: prefetchEntry(disabled) }),
		).resolves.toBeDefined();
	});

	it("doesn't revalidate data the server already has", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		backend.respondAll();
		await first;
		await load(client, { issue: prefetchEntry(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);
	});

	it("reuses a server request's data in a fetch entry until it's invalidated", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const first = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		backend.respondAll();
		await first;
		advance(client, 60_000);
		await load(client, { issue: fetchEntry(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);

		await invalidateOne(client, backend.issueQuery, { id: 1 });
		const after = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		await flush();

		expect(backend.requests).toHaveLength(1);

		backend.respondAll();
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
	});

	it("fetches the number of pages a paged entry asks for", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			pages: fetchEntry(backend.pageQuery, { size: 2 }, { pages: 2 }),
		});
		backend.respondAll();
		await flush();
		backend.respondAll();
		const [, data] = await loading;

		expect(data.pages.pages).toEqual([
			[0, 1],
			[2, 3],
		]);
	});

	it("records loads for devtools", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: prefetchEntry(backend.issueQuery, { id: 1 }),
		});

		expect(loadsOf(client)).toEqual([
			{
				entries: [
					{
						hash: '["issues","byId",{"id":1}]',
						kind: "prefetch",
						name: "issue",
					},
				],
				startedAt: client.clock.now(),
			},
		]);
		await loading;
		expect(loadsOf(testClient())).toEqual([]);
		vi.stubEnv("NODE_ENV", "production");
		const quiet = testClient();
		await load(quiet, { issue: prefetchEntry(backend.issueQuery, { id: 1 }) });
		expect(loadsOf(quiet)).toEqual([]);
		vi.unstubAllEnvs();
	});
});

describe("waterfallHandle", () => {
	it("makes a handle that reads as a waterfall", () => {
		const backend = createBackend();
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });

		expect(handle).toEqual({
			input: { id: 1 },
			queryKey: ["issues", "byId", { id: 1 }],
		});
		expect(isWaterfallHandle(handle)).toBe(true);
		expect(isWaterfallHandle({ ...handle })).toBe(false);
	});

	it("keeps the handle while a new input maps to the same query", () => {
		const backend = createBackend();
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });

		expect(waterfallHandle(backend.issueQuery, handle, { id: 1 })).toBe(handle);
		expect(
			waterfallHandle(backend.issueQuery, handle, { id: 2 }).input,
		).toEqual({ id: 2 });
	});
});
