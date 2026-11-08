/**
 * `load(client, { name: entry })` starts every entry, then waits for the
 * ones that need waiting for, and resolves with their handles and data.
 * `prefetch` never waits, `swr` waits only without data, and `revalidate`
 * waits for fresh data. `waterfallHandle` makes a handle whose reader
 * starts the query while rendering.
 */
import { QueryDevtoolsPanel } from "@raf-query/react";
import { screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	getData,
	invalidateOne,
	isFail,
	isQueryFailure,
	load,
	prefetch,
	queryOptions,
	revalidate,
	swr,
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
			first: revalidate(backend.issueQuery, { id: 1 }),
			second: swr(backend.issueQuery, { id: 2 }),
			third: prefetch(backend.issueQuery, { id: 3 }),
		});

		expect(backend.requests.map((request) => request.id)).toEqual([1, 2, 3]);
		await backend.respondAll();
		const [handles, data] = await loading;

		expect(data).toEqual({
			first: { author: "ada", id: 1, title: "First" },
			second: { author: "bob", id: 2, title: "Second" },
		});
		expect(handles).toEqual({
			first: { input: { id: 1 }, queryKey: issues("byId", { id: 1 }) },
			second: { input: { id: 2 }, queryKey: issues("byId", { id: 2 }) },
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
				repo: revalidate(byOwner, { owner: "ada", repo: "raf" }),
			}),
			load(client, {
				// oxlint-disable-next-line perfectionist/sort-objects -- the other field order
				repo: swr(byOwner, { repo: "raf", owner: "ada" }),
			}),
			load(client, { repo: swr(byOwner, bare) }),
		]);
		gate.resolve();
		const values = (await loads).map(([, data]) => data.repo);

		expect(calls).toBe(1);
		expect(values).toEqual(["ada/raf", "ada/raf", "ada/raf"]);
	});

	it("uses fresh data, and refetches stale data for revalidate entries", async () => {
		const backend = createBackend();
		const client = testClient({ staleTime: 1000 });
		const first = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		await load(client, { issue: revalidate(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);
		advance(client, 1000);
		backend.store.set(1, { author: "ada", id: 1, title: "Renamed" });
		const second = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
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
		const first = load(client, { issue: revalidate(brief, { id: 1 }) });
		await backend.respondAll();
		await first;
		void load(client, { issue: revalidate(brief, { id: 1 }) });

		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
	});

	it("resolves swr entries with stale data at once, and refetches them in the background", async () => {
		const backend = createBackend();
		const client = testClient();
		const first = load(client, {
			issue: swr(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		backend.store.set(1, { author: "ada", id: 1, title: "Renamed" });

		const [, data] = await load(client, {
			issue: swr(backend.issueQuery, { id: 1 }),
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
			missing: revalidate(backend.issueQuery, { id: 9 }),
			other: prefetch(backend.issueQuery, { id: 1 }),
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
			issue: swr(backend.issueQuery, { id: 1 }),
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
			issue: prefetch(backend.issueQuery, { id: 1 }),
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

		await expect(load(client, { value: revalidate(disabled) })).rejects.toThrow(
			'Query ["issues","disabled"] is disabled',
		);
		await load(client, { value: prefetch(disabled) });
		expect(calls).toBe(0);
	});

	it("doesn't revalidate data the server already has", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const first = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		await load(client, {
			cached: swr(backend.issueQuery, { id: 1 }),
			prefetched: prefetch(backend.issueQuery, { id: 1 }),
		});

		expect(backend.requests).toHaveLength(0);
	});

	it("reuses a server request's data in a revalidate entry until a write invalidates it", async () => {
		const backend = createBackend();
		const client = testClient({ isServer: true });
		const first = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		await first;
		advance(client, 60_000);
		await load(client, { issue: revalidate(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(0);
		await invalidateOne(client, backend.issueQuery, { id: 1 });
		const after = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
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
		const [, data] = await load(client, { title: revalidate(titled) });

		expect(data.title).toBe("HELLO");
		expect(getData(client, titled)).toEqual({ title: "hello" });
	});

	it("shows its latest loads in the devtools, in development only", async () => {
		const backend = createBackend();
		const client = testClient();
		mount(client, createElement(QueryDevtoolsPanel));
		const loading = load(client, {
			issue: prefetch(backend.issueQuery, { id: 1 }),
			title: swr(backend.draftQuery, { id: 2 }),
		});
		await backend.respondAll();
		await loading;

		expect(screen.getByText("issue (prefetch), title (swr)")).toBeDefined();
		vi.stubEnv("NODE_ENV", "production");
		const quiet = testClient();
		await load(quiet, { issue: prefetch(backend.issueQuery, { id: 1 }) });
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

	it("keeps the handle while the updated input maps to the same query", () => {
		const backend = createBackend();
		const handle = waterfallHandle(backend.issueQuery, { id: 1 });
		const inputs: Array<{ readonly id: number }> = [];

		expect(
			waterfallHandle(backend.issueQuery, handle, (input) => {
				inputs.push(input);
				return { ...input };
			}),
		).toBe(handle);
		expect(inputs).toEqual([{ id: 1 }]);
		const next = waterfallHandle(backend.issueQuery, handle, (input) => ({
			id: input.id + 1,
		}));
		expect(next).not.toBe(handle);
		expect(next.input).toEqual({ id: 2 });
		expect(waterfallHandle(backend.issueQuery, next, () => ({ id: 2 }))).toBe(
			next,
		);
	});
});
