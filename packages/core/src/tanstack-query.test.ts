import { readFileSync } from "node:fs";

import {
	dehydrate as dehydrateTanStack,
	hydrate as hydrateTanStack,
	QueryClient as TanStackQueryClient,
	QueryObserver,
	type QueryObserverOptions,
} from "@tanstack/query-core";
import { describe, expect, it } from "vitest";

import { createQueryClient, mount, type QueryClient } from "./client.ts";
import {
	entryOf,
	fetchEntry,
	isInvalidated,
	isStale,
	remove,
	subscribeEntry,
} from "./entry.ts";
import { fail, isQueryFailure, QueryFailure } from "./fail.ts";
import { group, type GroupKey } from "./groups.ts";
import { dehydrate, hydrate } from "./hydration.ts";
import { load, ensureEntry } from "./load.ts";
import { queryOptions } from "./options.ts";
import {
	tanstackQuerySync,
	type QueryClientLike,
	type TanStackQuerySyncOptions,
} from "./tanstack-query.ts";
import { flush } from "./test-utils.ts";
import {
	getData,
	invalidateMany,
	invalidateOne,
	removeAll,
	removeOne,
	resetOne,
	setData,
} from "./verbs.ts";

const issue = group("issue");

interface Issue {
	readonly id: number;
	readonly title: string;
}

/** A backend both caches fetch from, counting requests per side. */
function createApi() {
	const titles = new Map([
		[1, "First"],
		[2, "Second"],
	]);
	const calls = { raf: 0, tanstack: 0 };
	const get = (id: number): Issue => ({
		id,
		title: titles.get(id) ?? "?",
	});
	/** The raf factory for the key TanStack Query screens use too. */
	const issueQuery = (input: { readonly id: number }) =>
		queryOptions({
			queryFn: async () => {
				calls.raf += 1;
				await Promise.resolve();
				return input.id === 404
					? fail({ _tag: "NotFound", id: input.id })
					: get(input.id);
			},
			queryKey: issue(input.id),
			staleTime: 60_000,
		});
	/** The same query as a TanStack Query screen writes it. */
	const tanstackIssue = (id: number) => ({
		queryFn: async () => {
			calls.tanstack += 1;
			await Promise.resolve();
			if (id === 500) {
				throw new Error("Boom");
			}
			return get(id);
		},
		queryKey: ["issue", id],
		staleTime: 60_000,
	});
	return { calls, issueQuery, tanstackIssue, titles };
}

/** Both caches, synced while mounted; disposing unmounts and clears them. */
function synced(
	options?: TanStackQuerySyncOptions,
	before?: (caches: {
		readonly client: QueryClient;
		readonly tanstack: TanStackQueryClient;
	}) => void,
) {
	const tanstack = new TanStackQueryClient();
	const client = createQueryClient({
		features: [tanstackQuerySync(tanstack, options)],
		isServer: false,
	});
	before?.({ client, tanstack });
	let unmount = mount(client);
	return {
		client,
		[Symbol.dispose]() {
			unmount();
			removeAll(client);
			tanstack.clear();
		},
		tanstack,
		unmount() {
			unmount();
			unmount = () => {};
		},
	};
}

function observe(tanstack: TanStackQueryClient, options: QueryObserverOptions) {
	const observer = new QueryObserver(tanstack, options);
	return { observer, [Symbol.dispose]: observer.subscribe(() => {}) };
}

function read(client: QueryClient, entry: ReturnType<typeof entryOf>) {
	return { [Symbol.dispose]: subscribeEntry(entry, () => {}) };
}

describe("raf-query to TanStack Query", () => {
	it("mirrors data, with the time it was fetched", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		await fetchEntry(entry);

		expect(sync.tanstack.getQueryData(["issue", 1])).toBe(entry.state.data);
		expect(sync.tanstack.getQueryState(["issue", 1])?.dataUpdatedAt).toBe(
			entry.state.updatedAt,
		);
		setData(sync.client, api.issueQuery, { id: 1 }, { id: 1, title: "Edited" });
		await flush();
		expect(sync.tanstack.getQueryData(["issue", 1])).toEqual({
			id: 1,
			title: "Edited",
		});
	});

	it("gives a TanStack Query screen the data raf-query loaded, without a request", async () => {
		const api = createApi();
		using sync = synced();
		await load(sync.client, { issue: ensureEntry(api.issueQuery, { id: 1 }) });
		using screen = observe(sync.tanstack, api.tanstackIssue(1));

		expect(screen.observer.getCurrentResult()).toMatchObject({
			data: { id: 1, title: "First" },
			status: "success",
		});
		await flush();
		expect(api.calls).toEqual({ raf: 1, tanstack: 0 });
	});

	it("passes fail() values on as a QueryFailure, and defects as they are", async () => {
		const api = createApi();
		using sync = synced();
		using _screen = observe(sync.tanstack, {
			...api.tanstackIssue(404),
			enabled: false,
		});
		await fetchEntry(entryOf(sync.client, api.issueQuery, { id: 404 }));
		const error = sync.tanstack.getQueryState(["issue", 404])?.error;

		expect(isQueryFailure(error)).toBe(true);
		expect(error).toMatchObject({ fail: { _tag: "NotFound", id: 404 } });
		expect(sync.tanstack.getQueryState(["issue", 404])?.status).toBe("error");

		const broken = () =>
			queryOptions({
				queryFn: () => Promise.reject(new Error("Down")),
				queryKey: group("broken")(),
			});
		using _other = observe(sync.tanstack, {
			enabled: false,
			queryKey: ["broken"],
		});
		await fetchEntry(entryOf(sync.client, broken, undefined));
		expect(sync.tanstack.getQueryState(["broken"])?.error).toEqual(
			new Error("Down"),
		);
	});

	it("leaves errors out for queries TanStack Query doesn't have", async () => {
		const api = createApi();
		using sync = synced();
		await fetchEntry(entryOf(sync.client, api.issueQuery, { id: 404 }));

		expect(sync.tanstack.getQueryState(["issue", 404])).toBeUndefined();
	});

	it("leaves undefined data out", async () => {
		using sync = synced();
		const nothing = () =>
			queryOptions({ queryFn: () => undefined, queryKey: group("nothing")() });
		await fetchEntry(entryOf(sync.client, nothing, undefined));

		expect(sync.tanstack.getQueryState(["nothing"])).toBeUndefined();
	});
});

describe("TanStack Query to raf-query", () => {
	it("mirrors data, with the time it was fetched", async () => {
		const api = createApi();
		using sync = synced();
		await sync.tanstack.query(api.tanstackIssue(1));
		const state = sync.tanstack.getQueryState(["issue", 1]);

		expect(getData(sync.client, api.issueQuery, { id: 1 })).toBe(state?.data);
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		expect(entry.state.updatedAt).toBe(state?.dataUpdatedAt);
		expect(entry.thenable).toMatchObject({ status: "fulfilled" });
		sync.tanstack.setQueryData(["issue", 1], { id: 1, title: "Edited" });
		expect(entry.state.data).toEqual({ id: 1, title: "Edited" });
	});

	it("gives a raf-query screen the data TanStack Query loaded, without a request", async () => {
		const api = createApi();
		using sync = synced();
		await sync.tanstack.query(api.tanstackIssue(1));
		const [, data] = await load(sync.client, {
			issue: ensureEntry(api.issueQuery, { id: 1 }),
		});

		expect(data.issue).toEqual({ id: 1, title: "First" });
		expect(api.calls).toEqual({ raf: 0, tanstack: 1 });
	});

	it("passes errors on, unwrapping a QueryFailure to its fail() value", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 500 });
		await sync.tanstack
			.query({
				...api.tanstackIssue(500),
				retry: false,
			})
			.catch(() => {});

		expect(entry.state).toMatchObject({
			error: new Error("Boom"),
			status: "error",
		});
		expect(entry.thenable).toMatchObject({ status: "rejected" });

		const missing = entryOf(sync.client, api.issueQuery, { id: 404 });
		const failure = new QueryFailure(fail({ _tag: "NotFound", id: 404 }), "x");
		await sync.tanstack
			.query({
				queryFn: () => Promise.reject(failure),
				queryKey: ["issue", 404],
				retry: false,
			})
			.catch(() => {});
		expect(missing.state.error).toBe(failure.fail);
	});
});

describe("echoes", () => {
	it("writes each change to the other cache once", async () => {
		const api = createApi();
		using sync = synced();
		const writes: Array<string> = [];
		sync.tanstack.getQueryCache().subscribe((event) => {
			if (event.type === "updated" && event.action.type === "success") {
				writes.push("tanstack");
			}
		});
		sync.client.subscribe((event) => {
			if (event.type === "updated") {
				writes.push("raf");
			}
		});
		setData(sync.client, api.issueQuery, { id: 1 }, { id: 1, title: "A" });
		await flush();
		sync.tanstack.setQueryData(["issue", 1], { id: 1, title: "B" });
		await flush();

		expect(writes).toEqual(["tanstack", "raf", "tanstack", "raf"]);
		expect(getData(sync.client, api.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "B",
		});
	});

	it("settles when structural sharing keeps a different reference on each side", async () => {
		const api = createApi();
		using sync = synced();
		setData(sync.client, api.issueQuery, { id: 1 }, { id: 1, title: "Same" });
		await flush();
		let writes = 0;
		sync.tanstack.getQueryCache().subscribe(() => {
			writes += 1;
		});
		for (let round = 0; round < 3; round += 1) {
			sync.tanstack.setQueryData(["issue", 1], { id: 1, title: "Same" });
			setData(sync.client, api.issueQuery, { id: 1 }, { id: 1, title: "Same" });
			await flush();
		}
		const settled = writes;
		await flush();
		await flush();

		expect(settled).toBeLessThanOrEqual(6);
		expect(writes).toBe(settled);
	});
});

describe("invalidation", () => {
	it("marks the TanStack Query copy invalidated, and its screen refetches when raf-query won't", async () => {
		const api = createApi();
		using sync = synced();
		await fetchEntry(entryOf(sync.client, api.issueQuery, { id: 1 }));
		using _screen = observe(sync.tanstack, api.tanstackIssue(1));
		api.titles.set(1, "Renamed");
		await invalidateOne(sync.client, api.issueQuery, { id: 1 });
		await flush();

		expect(api.calls).toEqual({ raf: 1, tanstack: 1 });
		expect(getData(sync.client, api.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "Renamed",
		});
	});

	it("leaves the refetch to raf-query when it reads the query", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		await fetchEntry(entry);
		using _reader = read(sync.client, entry);
		using screen = observe(sync.tanstack, api.tanstackIssue(1));
		api.titles.set(1, "Renamed");
		await invalidateOne(sync.client, api.issueQuery, { id: 1 });
		await flush();

		expect(api.calls).toEqual({ raf: 2, tanstack: 0 });
		expect(screen.observer.getCurrentResult().data).toEqual({
			id: 1,
			title: "Renamed",
		});
		expect(sync.tanstack.getQueryState(["issue", 1])?.isInvalidated).toBe(
			false,
		);
	});

	it("marks the raf-query copy stale, and raf-query refetches when TanStack Query won't", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		await fetchEntry(entry);
		using _reader = read(sync.client, entry);
		api.titles.set(1, "Renamed");
		await sync.tanstack.invalidateQueries({ queryKey: ["issue"] });
		await flush();

		expect(api.calls).toEqual({ raf: 2, tanstack: 0 });
		expect(sync.tanstack.getQueryData(["issue", 1])).toEqual({
			id: 1,
			title: "Renamed",
		});
	});

	it("leaves the refetch to a TanStack Query screen that reads the query", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		await fetchEntry(entry);
		using _reader = read(sync.client, entry);
		using _screen = observe(sync.tanstack, api.tanstackIssue(1));
		api.titles.set(1, "Renamed");
		const done = sync.tanstack.invalidateQueries({ queryKey: ["issue", 1] });

		expect(isInvalidated(entry)).toBe(true);
		await done;
		await flush();
		expect(api.calls).toEqual({ raf: 1, tanstack: 1 });
		expect(entry.state.data).toEqual({ id: 1, title: "Renamed" });
		expect(isStale(entry)).toBe(false);
	});

	it("marks unread raf-query entries stale for their next read", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		await fetchEntry(entry);
		await sync.tanstack.invalidateQueries({ queryKey: ["issue", 1] });

		expect(isStale(entry)).toBe(true);
		expect(api.calls).toEqual({ raf: 1, tanstack: 0 });
	});

	it("reaches every raf-query entry under a key prefix TanStack Query invalidates", async () => {
		using sync = synced();
		const posts = group("posts");
		const drafts = group(posts, "drafts");
		const users = group("users");
		let calls = 0;
		const make =
			(key: (input: { readonly id: number }) => GroupKey) =>
			(input: { readonly id: number; readonly lang?: string }) =>
				queryOptions({
					queryFn: () => {
						calls += 1;
						return calls;
					},
					queryKey: key(input),
					staleTime: 60_000,
				});
		const postById = make((input) => posts("byId", input));
		const draftById = make((input) => drafts("byId", input));
		const userById = make((input) => users("byId", input));
		const watched = [
			entryOf(sync.client, postById, { id: 1, lang: "en" }),
			entryOf(sync.client, draftById, { id: 1 }),
			entryOf(sync.client, userById, { id: 1 }),
		];
		const unread = entryOf(sync.client, postById, { id: 2 });
		await Promise.all([...watched, unread].map((entry) => fetchEntry(entry)));
		const readers = watched.map((entry) => subscribeEntry(entry, () => {}));

		expect(
			sync.tanstack.getQueryData(posts("byId", { id: 1, lang: "en" })),
		).toBe(1);
		await sync.tanstack.invalidateQueries({ queryKey: posts() });
		await flush();
		expect(watched.map((entry) => entry.state.data)).toEqual([5, 6, 3]);
		expect(isStale(unread)).toBe(true);
		expect(calls).toBe(6);

		await sync.tanstack.invalidateQueries({
			queryKey: posts("byId", { id: 1 }),
		});
		await flush();
		expect(watched.map((entry) => entry.state.data)).toEqual([7, 6, 3]);
		for (const stop of readers) {
			stop();
		}
	});

	it("reaches queries only TanStack Query has when raf-query invalidates a group", async () => {
		using sync = synced();
		const posts = group("posts");
		const drafts = group(posts, "drafts");
		sync.tanstack.setQueryData(drafts("byId", { id: 2 }), "draft");
		sync.tanstack.setQueryData(["users", 1], "user");
		await invalidateMany(sync.client, posts);

		expect(
			sync.tanstack.getQueryState(drafts("byId", { id: 2 }))?.isInvalidated,
		).toBe(true);
		expect(sync.tanstack.getQueryState(["users", 1])?.isInvalidated).toBe(
			false,
		);
	});

	it("skips invalidations of queries raf-query doesn't have", async () => {
		using sync = synced();
		sync.tanstack.setQueryData(["other"], 1);
		remove(sync.client["~entries"].get('["other"]')!);
		await sync.tanstack.invalidateQueries({ queryKey: ["other"] });

		expect(sync.client["~entries"].size).toBe(0);
	});
});

describe("resets and removals", () => {
	it("resets the other copy", async () => {
		const api = createApi();
		using sync = synced();
		const entry = entryOf(sync.client, api.issueQuery, { id: 1 });
		await fetchEntry(entry);
		await resetOne(sync.client, api.issueQuery, { id: 1 });
		await flush();

		expect(sync.tanstack.getQueryState(["issue", 1])?.data).toBeUndefined();

		await fetchEntry(entry);
		await sync.tanstack.resetQueries({ queryKey: ["issue", 1] });
		await flush();
		expect(entry.state.hasData).toBe(false);
	});

	it("removes the other copy unless something reads it", async () => {
		const api = createApi();
		using sync = synced();
		await fetchEntry(entryOf(sync.client, api.issueQuery, { id: 1 }));
		await fetchEntry(entryOf(sync.client, api.issueQuery, { id: 2 }));
		using _screen = observe(sync.tanstack, {
			...api.tanstackIssue(2),
			enabled: false,
		});
		removeOne(sync.client, api.issueQuery, { id: 1 });
		removeOne(sync.client, api.issueQuery, { id: 2 });

		expect(sync.tanstack.getQueryState(["issue", 1])).toBeUndefined();
		expect(sync.tanstack.getQueryData(["issue", 2])).toEqual({
			id: 2,
			title: "Second",
		});

		await sync.tanstack.query(api.tanstackIssue(1));
		const reader = entryOf(sync.client, api.issueQuery, { id: 2 });
		using _reader = read(sync.client, reader);
		sync.tanstack.removeQueries({ queryKey: ["issue"] });
		expect(sync.client["~entries"].has('["issue",1]')).toBe(false);
		expect(reader.state.data).toEqual({ id: 2, title: "Second" });
	});

	it("keeps the original when its mirror is removed", async () => {
		const api = createApi();
		using sync = synced();
		await fetchEntry(entryOf(sync.client, api.issueQuery, { id: 1 }));
		const mirror = sync.tanstack
			.getQueryCache()
			.find({ queryKey: ["issue", 1] });
		sync.tanstack.getQueryCache().remove(mirror!);

		expect(getData(sync.client, api.issueQuery, { id: 1 })).toBeDefined();

		await sync.tanstack.query(api.tanstackIssue(2));
		remove(sync.client["~entries"].get('["issue",2]')!);
		expect(sync.tanstack.getQueryData(["issue", 2])).toBeDefined();
	});
});

describe("hydration", () => {
	it("mirrors what raf-query hydrates", async () => {
		const api = createApi();
		const server = createQueryClient({ isServer: true });
		await fetchEntry(entryOf(server, api.issueQuery, { id: 1 }));
		const pending = fetchEntry(entryOf(server, api.issueQuery, { id: 2 }));
		const state = dehydrate(server);
		using sync = synced();
		hydrate(sync.client, state);
		await flush();

		expect(sync.tanstack.getQueryData(["issue", 1])).toEqual({
			id: 1,
			title: "First",
		});
		await pending;
		await flush();
		expect(sync.tanstack.getQueryData(["issue", 2])).toEqual({
			id: 2,
			title: "Second",
		});
	});

	it("mirrors what TanStack Query hydrates", async () => {
		const api = createApi();
		const server = new TanStackQueryClient();
		await server.query(api.tanstackIssue(1));
		const state = structuredClone(dehydrateTanStack(server));
		using sync = synced();
		hydrateTanStack(sync.tanstack, state);
		const [, data] = await load(sync.client, {
			issue: ensureEntry(api.issueQuery, { id: 1 }),
		});

		expect(data.issue).toEqual({ id: 1, title: "First" });
		expect(api.calls).toEqual({ raf: 0, tanstack: 1 });
	});

	it("merges both caches when it starts, newer data winning", async () => {
		const api = createApi();
		const tanstack = new TanStackQueryClient();
		tanstack.setQueryData(
			["issue", 1],
			{ id: 1, title: "Older" },
			{
				updatedAt: 1,
			},
		);
		tanstack.setQueryData(["issue", 2], { id: 2, title: "Newer" });
		const client = createQueryClient({
			features: [tanstackQuerySync(tanstack)],
			isServer: false,
		});
		setData(client, api.issueQuery, { id: 1 }, { id: 1, title: "Newer" });
		setData(client, api.issueQuery, { id: 3 }, { id: 3, title: "Only raf" });
		await invalidateOne(client, api.issueQuery, { id: 3 });
		using _mounted = { [Symbol.dispose]: mount(client) };

		expect(tanstack.getQueryData(["issue", 1])).toEqual({
			id: 1,
			title: "Newer",
		});
		expect(getData(client, api.issueQuery, { id: 2 })).toEqual({
			id: 2,
			title: "Newer",
		});
		expect(tanstack.getQueryState(["issue", 3])?.isInvalidated).toBe(true);
		removeAll(client);
		tanstack.clear();
	});
});

describe("options", () => {
	it("mirrors only the keys `filter` takes", async () => {
		const api = createApi();
		const local = () =>
			queryOptions({ queryFn: () => 2, queryKey: group("local")() });
		const early = () =>
			queryOptions({ queryFn: () => 4, queryKey: group("early")() });
		using sync = synced({ filter: (key) => key[0] === "issue" }, (caches) => {
			caches.tanstack.setQueryData(["remote"], 1);
			setData(caches.client, early, undefined, 4);
		});
		setData(sync.client, api.issueQuery, { id: 1 }, { id: 1, title: "A" });
		setData(sync.client, local, undefined, 2);
		sync.tanstack.setQueryData(["private"], 3);
		sync.tanstack.removeQueries({ queryKey: ["private"] });
		removeOne(sync.client, local);
		await flush();

		expect(sync.tanstack.getQueryData(["issue", 1])).toEqual({
			id: 1,
			title: "A",
		});
		expect(sync.tanstack.getQueryData(["local"])).toBeUndefined();
		expect(sync.client["~entries"].has('["private"]')).toBe(false);
		expect(sync.client["~entries"].has('["remote"]')).toBe(false);
		expect(sync.tanstack.getQueryData(["early"])).toBeUndefined();
	});

	it("stops when the client unmounts", () => {
		const api = createApi();
		using sync = synced();
		sync.unmount();
		setData(sync.client, api.issueQuery, { id: 1 }, { id: 1, title: "A" });
		sync.tanstack.setQueryData(["issue", 2], { id: 2, title: "B" });

		expect(sync.tanstack.getQueryData(["issue", 1])).toBeUndefined();
		expect(getData(sync.client, api.issueQuery, { id: 2 })).toBeUndefined();
	});
});

describe("the shipped module", () => {
	it("takes a TanStack Query client by its shape, and imports no @tanstack package", () => {
		const client: QueryClientLike = new TanStackQueryClient();
		const source = readFileSync(
			new URL("tanstack-query.ts", import.meta.url),
			"utf8",
		);

		expect(client).toBeDefined();
		expect(source).not.toMatch(/from "@tanstack\//);
	});
});
