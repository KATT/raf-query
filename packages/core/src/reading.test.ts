/**
 * Reading: `useQuery` subscribes to the entry and hands out its thenable.
 * The thenable for a version of the data is one object, settled in place
 * (`status`, `value`), so `use()` resumes on it without suspending again.
 * Changes are batched per microtask; unread entries are dropped after
 * `gcTime`, on the client's `Clock`.
 */
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
	fail,
	getData,
	invalidateOne,
	isQueryFailure,
	load,
	prefetch,
	queryOptions,
	removeOne,
	resetOne,
	revalidate,
	setData,
	waterfallHandle,
} from "./index.ts";
import {
	advance,
	createBackend,
	flush,
	issues,
	read,
	start,
	testClient,
	timersOf,
} from "./test-utils.ts";

describe("a read query", () => {
	it("settles the thenable it rendered in place, so use() resumes on it", async () => {
		const backend = createBackend();
		const client = testClient();
		const [handles] = await load(client, {
			issue: prefetch(backend.issueQuery, { id: 1 }),
		});
		const view = read(client, backend.issueQuery, handles.issue);
		const thenable = view.result.current[0];

		expect(thenable.status).toBe("pending");
		expect(view.result.current[1]).toMatchObject({
			isFetching: true,
			isPending: true,
			isStale: true,
			updatedAt: 0,
		});
		await backend.respondAll();
		expect(view.result.current[0]).toBe(thenable);
		expect(thenable).toMatchObject({ status: "fulfilled", value: { id: 1 } });
		expect(view.result.current[1]).toMatchObject({
			isFetching: false,
			isPending: false,
			updatedAt: client.clock.now(),
		});
	});

	it("renders once for the changes of one batch", async () => {
		const backend = createBackend();
		const client = testClient();
		const reader = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		await backend.respondAll();
		const before = reader.renders();
		await act(async () => {
			for (const title of ["a", "b", "c"]) {
				setData(client, backend.issueQuery, { id: 1 }, (issue) => ({
					author: "ada",
					id: 1,
					title: `${issue?.title} ${title}`,
				}));
			}
		});

		expect(reader.renders()).toBe(before + 1);
		expect(reader.result.current[0]).toMatchObject({
			value: { title: "First a b c" },
		});
	});

	it("records a failed refetch, and keeps the data it had", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		await backend.respondAll();
		const [refetch] = await start(() => view.result.current[1].refetch());
		backend.requests[0]?.fail(new Error("down"));
		await refetch;

		expect(view.result.current[1].error).toEqual(new Error("down"));
		expect(view.result.current[0]).toMatchObject({
			status: "fulfilled",
			value: { title: "First" },
		});
	});

	it("rejects with a QueryFailure for fail(), and again after a refetch", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 9 }),
		);
		await backend.respondAll();

		expect(view.result.current[1].error).toEqual(
			fail({ _tag: "NotFound", id: 9 }),
		);
		await expect(view.result.current[0]).rejects.toSatisfy(isQueryFailure);
		const [refetch] = await start(() => view.result.current[1].refetch());
		expect(view.result.current[0].status).toBe("pending");
		await backend.respondAll();
		await refetch;
		expect(view.result.current[0].status).toBe("rejected");
	});

	it("restarts its request when invalidated, and the old request's answer is dropped", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		const [old] = backend.requests;
		const [invalidating] = await start(() =>
			invalidateOne(client, backend.issueQuery, { id: 1 }),
		);

		expect(old?.signal.aborted).toBe(true);
		old?.respond();
		backend.store.set(1, { author: "ada", id: 1, title: "New" });
		backend.requests[1]?.respond();
		await invalidating;
		await flush();
		expect(view.result.current[0]).toMatchObject({ value: { title: "New" } });
	});

	it("drops a failure that arrives for a request it restarted", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		const [old] = backend.requests;
		const [invalidating] = await start(() =>
			invalidateOne(client, backend.issueQuery, { id: 1 }),
		);
		old?.fail(new Error("late"));
		backend.requests[1]?.respond();
		await invalidating;

		expect(view.result.current[1].error).toBeUndefined();
		expect(view.result.current[0]).toMatchObject({ value: { title: "First" } });
	});

	it("refetches on mount when it was invalidated while nobody read it", async () => {
		const backend = createBackend();
		const client = testClient({ staleTime: Infinity });
		const loading = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		const [handles] = await loading;
		await invalidateOne(client, backend.issueQuery, { id: 1 });

		expect(backend.requests).toHaveLength(0);
		const view = read(client, backend.issueQuery, handles.issue);
		expect(view.result.current[0]).toMatchObject({
			value: { title: "First" },
		});
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
	});

	it("doesn't run while disabled", async () => {
		let calls = 0;
		const client = testClient();
		const disabled = () =>
			queryOptions({
				enabled: false,
				queryFn: () => {
					calls += 1;
					return 1;
				},
				queryKey: issues("off"),
			});
		const view = read(client, disabled, waterfallHandle(disabled));
		await act(() => view.result.current[1].refetch());
		await act(() => invalidateOne(client, disabled));

		expect(calls).toBe(0);
		expect(view.result.current[1].isFetching).toBe(false);
	});

	it("maps its data through select, settled or not, and keeps the mapped thenable", async () => {
		const backend = createBackend();
		const client = testClient();
		const title = (input: { readonly id: number }) => ({
			...backend.issueQuery(input),
			select: (issue: { readonly title: string }) => issue.title.toUpperCase(),
		});
		const pending = read(client, title, waterfallHandle(title, { id: 1 }));
		const missing = read(client, title, waterfallHandle(title, { id: 9 }));
		await backend.respondAll();

		await expect(pending.result.current[0]).resolves.toBe("FIRST");
		await expect(missing.result.current[0]).rejects.toSatisfy(isQueryFailure);
		const settled = read(client, title, waterfallHandle(title, { id: 1 }));
		const failed = read(client, title, waterfallHandle(title, { id: 9 }));
		expect(settled.result.current[0]).toMatchObject({
			status: "fulfilled",
			value: "FIRST",
		});
		expect(failed.result.current[0].status).toBe("rejected");
		const [mapped] = settled.result.current;
		settled.rerender();
		expect(settled.result.current[0]).toBe(mapped);
	});
});

describe("garbage collection", () => {
	it("drops data nobody reads after gcTime, and keeps it while it's read", async () => {
		const backend = createBackend();
		const client = testClient({ gcTime: 1000 });
		const loading = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
			other: revalidate(backend.issueQuery, { id: 2 }),
		});
		await backend.respondAll();
		const [handles] = await loading;
		const reader = read(client, backend.issueQuery, handles.issue);
		advance(client, 5000);

		expect(getData(client, backend.issueQuery, { id: 1 })).toBeDefined();
		expect(getData(client, backend.issueQuery, { id: 2 })).toBeUndefined();
		reader.unmount();
		advance(client, 999);
		expect(getData(client, backend.issueQuery, { id: 1 })).toBeDefined();
		advance(client, 1);
		expect(getData(client, backend.issueQuery, { id: 1 })).toBeUndefined();
	});

	it("waits for a request in flight, and takes a query's own gcTime", async () => {
		const backend = createBackend();
		const client = testClient();
		const brief = (input: { readonly id: number }) => ({
			...backend.issueQuery(input),
			gcTime: 10,
		});
		void load(client, { issue: prefetch(brief, { id: 1 }) });
		advance(client, 10);
		await backend.respondAll();

		expect(getData(client, brief, { id: 1 })).toBeDefined();
		advance(client, 10);
		expect(getData(client, brief, { id: 1 })).toBeUndefined();
	});

	it("leaves an entry that was removed while its collection waited", async () => {
		const backend = createBackend();
		const client = testClient({ gcTime: 10 });
		void load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });
		advance(client, 10);
		removeOne(client, backend.issueQuery, { id: 1 });
		await flush();
		advance(client, 10);
		await load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });

		expect(backend.requests).toHaveLength(2);
		await backend.respondAll();
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("First");
	});

	it("never collects on the server, or with an infinite gcTime", async () => {
		const backend = createBackend();
		const server = testClient({ isServer: true });
		const browser = testClient({ gcTime: Infinity });
		void load(server, { issue: prefetch(backend.issueQuery, { id: 1 }) });
		void load(browser, { issue: prefetch(backend.issueQuery, { id: 1 }) });
		await backend.respondAll();

		expect([timersOf(server), timersOf(browser)]).toEqual([0, 0]);
	});
});

describe("reset", () => {
	it("drops data, and refetches it if read", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		const [handles] = await loading;
		await resetOne(client, backend.issueQuery, { id: 1 });

		expect(getData(client, backend.issueQuery, { id: 1 })).toBeUndefined();
		expect(backend.requests).toHaveLength(0);
		const view = read(client, backend.issueQuery, {
			input: handles.issue.input,
			queryKey: handles.issue.queryKey,
		});
		await backend.respondAll();
		const [resetting] = await start(() =>
			resetOne(client, backend.issueQuery, { id: 1 }),
		);
		expect(view.result.current[1].isPending).toBe(true);
		expect(backend.requests).toHaveLength(1);
		await backend.respondAll();
		await resetting;
		expect(view.result.current[0]).toMatchObject({ value: { title: "First" } });
	});
});
