import { describe, expect, it } from "vitest";

import { entryOf, fetchEntry, isStale, subscribeEntry } from "./entry.ts";
import { isObject } from "./guards.ts";
import { hydrate } from "./hydration.ts";
import type { QueryInfo } from "./keys.ts";
import {
	getData,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	isFetching,
	removeAll,
	removeMany,
	removeOne,
	resetAll,
	resetMany,
	resetOne,
	setData,
} from "./verbs.ts";
import {
	author,
	createBackend,
	drafts,
	featured,
	issues,
	testClient,
	users,
} from "./test-utils.ts";

async function loaded() {
	const backend = createBackend();
	const client = testClient({ staleTime: Infinity });
	const one = entryOf(client, backend.issueQuery, { id: 1 });
	const two = entryOf(client, backend.issueQuery, { id: 2 });
	const draft = entryOf(client, backend.draftQuery, { id: 3 });
	const done = Promise.all([
		fetchEntry(one),
		fetchEntry(two),
		fetchEntry(draft),
	]);
	backend.respondAll();
	await done;
	return { backend, client, draft, one, two };
}

describe("invalidation", () => {
	it("invalidates one query, refetching it if read", async () => {
		const cache = await loaded();
		using _reader = { [Symbol.dispose]: subscribeEntry(cache.one, () => {}) };
		const invalidating = invalidateOne(cache.client, cache.backend.issueQuery, {
			id: 1,
		});

		expect(cache.backend.requests.map((request) => request.id)).toEqual([1]);
		expect(isStale(cache.two)).toBe(false);
		cache.backend.respondAll();
		await invalidating;
		expect(isStale(cache.one)).toBe(false);
	});

	it("marks unread queries stale without fetching", async () => {
		const cache = await loaded();
		await invalidateOne(cache.client, cache.backend.issueQuery, { id: 1 });

		expect(cache.backend.requests).toHaveLength(0);
		expect(isStale(cache.one)).toBe(true);
	});

	it("covers a group's subgroups, but not other groups", async () => {
		const cache = await loaded();
		await invalidateMany(cache.client, drafts);

		expect(isStale(cache.draft)).toBe(true);
		expect(isStale(cache.one)).toBe(false);
		await invalidateMany(cache.client, users);
		await invalidateMany(cache.client, issues);
		expect(isStale(cache.one)).toBe(true);
	});

	it("matches a factory's queries, optionally by part of their input", async () => {
		const cache = await loaded();
		await invalidateMany(cache.client, cache.backend.issueQuery, { id: 2 });

		expect([isStale(cache.one), isStale(cache.two)]).toEqual([false, true]);
		await invalidateMany(cache.client, cache.backend.issueQuery);
		expect([isStale(cache.one), isStale(cache.draft)]).toEqual([true, false]);
	});

	it("matches tags with or without their parameter", async () => {
		const cache = await loaded();
		await invalidateMany(cache.client, author, "bob");

		expect([isStale(cache.one), isStale(cache.two)]).toEqual([false, true]);
		await invalidateMany(cache.client, author);
		expect(isStale(cache.one)).toBe(true);
		expect(isStale(cache.draft)).toBe(false);
		await invalidateMany(cache.client, featured);
		expect(isStale(cache.draft)).toBe(true);
	});

	it("invalidates everything", async () => {
		const cache = await loaded();
		await invalidateAll(cache.client);

		expect([isStale(cache.one), isStale(cache.draft)]).toEqual([true, true]);
	});

	it("doesn't count data that arrived after the invalidation", async () => {
		const cache = await loaded();
		await invalidateMany(cache.client, issues);
		const refetch = fetchEntry(cache.one);
		cache.backend.respondAll();
		await refetch;

		expect(isStale(cache.one)).toBe(false);
	});

	function hydratedClient() {
		const client = testClient({ staleTime: Infinity });
		hydrate(client, {
			entries: [
				{
					data: { author: "ada", id: 1, title: "First" },
					queryKey: structuredClone([issues, "byId", { id: 1 }]),
					updatedAt: client.clock.now(),
				},
			],
		});
		return client;
	}

	it("matches hydrated entries by group before a factory reads them", async () => {
		const client = hydratedClient();
		await invalidateMany(client, issues);

		const backend = createBackend();
		expect(isStale(entryOf(client, backend.issueQuery, { id: 1 }))).toBe(true);
	});

	it("matches hydrated entries by tag once a factory reads them", async () => {
		const client = hydratedClient();
		await invalidateMany(client, author, "bob");
		await invalidateMany(client, author, "ada");

		const backend = createBackend();
		expect(isStale(entryOf(client, backend.issueQuery, { id: 1 }))).toBe(true);
	});

	it("matches a one-off where target with its parameter", async () => {
		const cache = await loaded();
		const byTitle = {
			where: (query: QueryInfo, title: string) =>
				isObject(query.data) &&
				"title" in query.data &&
				query.data.title === title,
		};
		await invalidateMany(cache.client, byTitle, "Second");

		expect([isStale(cache.one), isStale(cache.two)]).toEqual([false, true]);
	});
});

describe("reset and remove", () => {
	it("resets one query, a target's, or all", async () => {
		const cache = await loaded();
		await resetOne(cache.client, cache.backend.issueQuery, { id: 1 });
		await resetOne(cache.client, cache.backend.issueQuery, { id: 7 });

		expect([cache.one.state.hasData, cache.two.state.hasData]).toEqual([
			false,
			true,
		]);
		await resetMany(cache.client, author);
		expect(cache.two.state.hasData).toBe(false);
		await resetAll(cache.client);
		expect(cache.draft.state.hasData).toBe(false);
	});

	it("resets a factory's queries matching part of their input", async () => {
		const cache = await loaded();
		await resetMany(cache.client, cache.backend.issueQuery, { id: 2 });

		expect([cache.one.state.hasData, cache.two.state.hasData]).toEqual([
			true,
			false,
		]);
	});

	it("removes one query, a target's, or all", async () => {
		const cache = await loaded();
		removeOne(cache.client, cache.backend.issueQuery, { id: 1 });
		removeOne(cache.client, cache.backend.issueQuery, { id: 7 });

		expect(cache.client["~entries"].size).toBe(2);
		removeMany(cache.client, drafts);
		expect(cache.client["~entries"].size).toBe(1);
		removeMany(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(cache.client["~entries"].size).toBe(0);
		entryOf(cache.client, cache.backend.issueQuery, { id: 1 });
		removeAll(cache.client);
		expect(cache.client["~entries"].size).toBe(0);
	});
});

describe("data", () => {
	it("writes and reads a query's data", async () => {
		const cache = await loaded();
		setData(cache.client, cache.backend.issueQuery, { id: 1 }, (issue) => ({
			author: "ada",
			id: 1,
			title: `${issue?.title} edited`,
		}));

		expect(
			getData(cache.client, cache.backend.issueQuery, { id: 1 })?.title,
		).toBe("First edited");
		setData(
			cache.client,
			cache.backend.issueQuery,
			{ id: 5 },
			{
				author: "cy",
				id: 5,
				title: "Fifth",
			},
		);
		expect(
			getData(cache.client, cache.backend.issueQuery, { id: 5 })?.title,
		).toBe("Fifth");
		expect(
			getData(cache.client, cache.backend.issueQuery, { id: 6 }),
		).toBeUndefined();
	});

	it("counts queries with a request in flight", async () => {
		const cache = await loaded();

		expect(isFetching(cache.client)).toBe(0);
		void fetchEntry(cache.one);
		expect(isFetching(cache.client)).toBe(1);
		expect(isFetching(cache.client, drafts)).toBe(0);
		expect(isFetching(cache.client, cache.backend.issueQuery)).toBe(1);
		cache.backend.respondAll();
	});
});
