import { assert, asyncProperty, type JsonValue, jsonValue } from "fast-check";
import { describe, expect, it } from "vitest";

import { group } from "./groups.ts";
import { hydrate } from "./hydration.ts";
import {
	ensureEntry,
	fetchEntry,
	getData,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	isFetching,
	load,
	prefetchEntry,
	type InputOf,
	type PartialInput,
	type QueryMeta,
	type Target,
	queryOptions,
	removeAll,
	removeMany,
	removeOne,
	resetAll,
	resetMany,
	resetOne,
	setData,
} from "./index.ts";
import {
	author,
	createBackend,
	drafts,
	featured,
	issues,
	read,
	testClient,
	users,
} from "./test-utils.ts";

/** A client with issues 1 and 2 and draft 3 cached and fresh forever. */
async function cached() {
	const backend = createBackend();
	const client = testClient({ staleTime: Infinity });
	const loading = load(client, {
		draft: fetchEntry(backend.draftQuery, { id: 3 }),
		one: fetchEntry(backend.issueQuery, { id: 1 }),
		two: fetchEntry(backend.issueQuery, { id: 2 }),
	});
	await backend.respondAll();
	const [handles] = await loading;
	/** Which of them the next fetch entries refetch: the stale ones. */
	const refetched = async () => {
		void load(client, {
			draft: fetchEntry(backend.draftQuery, { id: 3 }),
			one: fetchEntry(backend.issueQuery, { id: 1 }),
			two: fetchEntry(backend.issueQuery, { id: 2 }),
		});
		const ids = backend.requests.map((request) =>
			request.id === 3 ? "draft" : request.id === 1 ? "one" : "two",
		);
		await backend.respondAll();
		return ids;
	};
	return { backend, client, handles, refetched };
}

describe("invalidation", () => {
	it("refetches a read query at once, and leaves the rest for their next load", async () => {
		const cache = await cached();
		const reader = read(
			cache.client,
			cache.backend.issueQuery,
			cache.handles.one,
		);
		const invalidating = invalidateOne(cache.client, cache.backend.issueQuery, {
			id: 1,
		});

		expect(cache.backend.requests.map((request) => request.id)).toEqual([1]);
		await cache.backend.respondAll();
		await invalidating;
		reader.unmount();
		await invalidateOne(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(cache.backend.requests).toHaveLength(0);
		expect(await cache.refetched()).toEqual(["two"]);
	});

	it("covers a group's subgroups, but not other groups", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, drafts);
		expect(await cache.refetched()).toEqual(["draft"]);

		await invalidateMany(cache.client, users);
		expect(await cache.refetched()).toEqual([]);
		await invalidateMany(cache.client, issues);
		expect(await cache.refetched()).toEqual(["draft", "one", "two"]);
	});

	it("matches a group by its whole name, not a prefix of it", async () => {
		const client = testClient({ staleTime: Infinity });
		let calls = 0;
		const archived = () =>
			queryOptions({
				queryFn: () => (calls += 1),
				queryKey: group("issues-archive")("list"),
			});
		await load(client, { list: fetchEntry(archived) });
		await invalidateMany(client, issues);
		await load(client, { list: fetchEntry(archived) });

		expect(calls).toBe(1);
	});

	it("matches a factory's queries, optionally by part of their input", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(await cache.refetched()).toEqual(["two"]);

		await invalidateMany(cache.client, cache.backend.issueQuery);
		expect(await cache.refetched()).toEqual(["one", "two"]);
	});

	it("matches part of an input with nested objects and arrays", async () => {
		const client = testClient({ staleTime: Infinity });
		let calls = 0;
		const list = (input: {
			readonly filter: {
				readonly ids: ReadonlyArray<number>;
				readonly open: boolean;
			};
		}) =>
			queryOptions({
				queryFn: () => (calls += 1),
				queryKey: issues("list", input),
			});
		const input: InputOf<typeof list> = { filter: { ids: [1, 2], open: true } };
		await load(client, { list: fetchEntry(list, input) });
		const refetches = async (partial: PartialInput<typeof list>) => {
			const before = calls;
			await invalidateMany(client, list, partial);
			await load(client, { list: fetchEntry(list, input) });
			return calls > before;
		};

		expect(await refetches({ filter: { ids: [1, 2] } })).toBe(true);
		expect(await refetches({ filter: { ids: [1] } })).toBe(false);
		expect(await refetches({ filter: { ids: [1, 3] } })).toBe(false);
		expect(await refetches({ filter: { open: false } })).toBe(false);
		expect(await refetches({ filter: { open: true } })).toBe(true);
	});

	it("matches tags with or without their parameter", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, author, "bob");
		expect(await cache.refetched()).toEqual(["two"]);

		await invalidateMany(cache.client, author);
		expect(await cache.refetched()).toEqual(["one", "two"]);
		await invalidateMany(cache.client, featured);
		expect(await cache.refetched()).toEqual(["draft"]);
	});

	it("matches a one-off where target with its parameter", async () => {
		const cache = await cached();
		const byTitle: Target<QueryMeta, string> = {
			where: (query, title) =>
				// SAFETY: every query this test caches holds an issue or a draft string.
				(query.data as { readonly title?: string } | undefined)?.title ===
				title,
		};
		await invalidateMany(cache.client, byTitle, "Second");

		expect(await cache.refetched()).toEqual(["two"]);
	});

	it("invalidates everything", async () => {
		const cache = await cached();
		await invalidateAll(cache.client);

		expect(await cache.refetched()).toEqual(["draft", "one", "two"]);
	});

	it("doesn't count data that was requested after the invalidation", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, issues);
		expect(await cache.refetched()).toEqual(["draft", "one", "two"]);

		expect(await cache.refetched()).toEqual([]);
	});

	it("applies invalidations to hydrated queries once a factory reads them", async () => {
		const backend = createBackend();
		const client = testClient({ staleTime: Infinity });
		const issue = (id: number, by: string) => ({
			data: { author: by, id, title: `Issue ${id}` },
			queryKey: issues("byId", { id }),
			updatedAt: client.clock.now(),
		});
		hydrate(client, { entries: [issue(1, "ada"), issue(2, "bob")] });
		await invalidateMany(client, author, "ada");
		const loading = load(client, {
			one: fetchEntry(backend.issueQuery, { id: 1 }),
			two: fetchEntry(backend.issueQuery, { id: 2 }),
		});

		expect(backend.requests.map((request) => request.id)).toEqual([1]);
		await backend.respondAll();
		await loading;
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("First");
		expect(getData(client, backend.issueQuery, { id: 2 })?.title).toBe(
			"Issue 2",
		);
	});
});

describe("reset and remove", () => {
	it("reset one query, a target's, or all of them", async () => {
		const cache = await cached();
		await resetOne(cache.client, cache.backend.issueQuery, { id: 1 });
		await resetOne(cache.client, cache.backend.issueQuery, { id: 7 });
		const has = () =>
			[
				getData(cache.client, cache.backend.issueQuery, { id: 1 }),
				getData(cache.client, cache.backend.issueQuery, { id: 2 }),
				getData(cache.client, cache.backend.draftQuery, { id: 3 }),
			].map((data) => data !== undefined);

		expect(has()).toEqual([false, true, true]);
		await resetMany(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(has()).toEqual([false, false, true]);
		await resetAll(cache.client);
		expect(has()).toEqual([false, false, false]);
	});

	it("reset a query loading for nobody by starting it over", async () => {
		const backend = createBackend();
		const client = testClient();
		void load(client, { issue: prefetchEntry(backend.issueQuery, { id: 1 }) });
		const [old] = backend.requests;
		const resetting = resetMany(client, issues);

		expect(old?.signal.aborted).toBe(true);
		await backend.respondAll();
		await resetting;
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("First");
	});

	it("remove one query, a target's, or all, aborting their requests", async () => {
		const cache = await cached();
		removeOne(cache.client, cache.backend.issueQuery, { id: 1 });
		removeOne(cache.client, cache.backend.issueQuery, { id: 7 });
		const has = () =>
			[
				getData(cache.client, cache.backend.issueQuery, { id: 1 }),
				getData(cache.client, cache.backend.issueQuery, { id: 2 }),
				getData(cache.client, cache.backend.draftQuery, { id: 3 }),
			].map((data) => data !== undefined);

		expect(has()).toEqual([false, true, true]);
		removeMany(cache.client, drafts);
		expect(has()).toEqual([false, true, false]);
		const loading = load(cache.client, {
			one: ensureEntry(cache.backend.issueQuery, { id: 1 }),
		}).catch((error: unknown) => error);
		removeAll(cache.client);
		expect(has()).toEqual([false, false, false]);
		expect(cache.backend.requests[0]?.signal.aborted).toBe(true);
		expect(await loading).toMatchObject({ name: "AbortError" });
	});
});

/** What these tests write with `setData`. */
type Data = Date | JsonValue | ReadonlyArray<number>;

const any = () =>
	queryOptions({ queryFn: (): Data => null, queryKey: issues("any") });

describe("data", () => {
	it("writes a query's data from its previous data, or outright", async () => {
		const cache = await cached();
		setData(cache.client, cache.backend.issueQuery, { id: 1 }, (issue) => ({
			author: "ada",
			id: 1,
			title: `${issue?.title} edited`,
		}));
		setData(cache.client, cache.backend.issueQuery, { id: 5 }, (issue) => ({
			author: "cy",
			id: 5,
			title: issue?.title ?? "Fifth",
		}));
		setData(
			cache.client,
			cache.backend.issueQuery,
			{ id: 6 },
			{
				author: "cy",
				id: 6,
				title: "Sixth",
			},
		);

		expect(
			[1, 5, 6, 7].map(
				(id) => getData(cache.client, cache.backend.issueQuery, { id })?.title,
			),
		).toEqual(["First edited", "Fifth", "Sixth", undefined]);
		expect(await cache.refetched()).toEqual([]);
	});

	it("reads nothing for a query that is cached without data", async () => {
		const backend = createBackend();
		const client = testClient();
		void load(client, { issue: prefetchEntry(backend.issueQuery, { id: 1 }) });

		expect(getData(client, backend.issueQuery, { id: 1 })).toBeUndefined();
		await backend.respondAll();
	});

	it("keeps the identity of every part of new data that equals the old", async () => {
		await assert(
			asyncProperty(jsonValue(), jsonValue(), async (previous, next) => {
				const client = testClient();
				setData(client, any, undefined, previous);
				setData(client, any, undefined, structuredClone(next));
				const written = getData(client, any);
				setData(client, any, undefined, structuredClone(next));

				expect(written).toEqual(next);
				expect(getData(client, any)).toBe(written);
			}),
			{
				// `jsonValue()` draws an own `"__proto__"` key in about one value
				// in 2000, so these run every time rather than when the seed hits.
				examples: [
					[{}, JSON.parse('{"__proto__":{}}')],
					[
						JSON.parse('{"__proto__":{"a":1}}'),
						JSON.parse('{"__proto__":{"a":1}}'),
					],
					[[JSON.parse('{"__proto__":null}')], [JSON.parse('{"__proto__":1}')]],
				],
			},
		);
		const client = testClient();
		const list = {
			a: { b: 1 },
			list: [{ id: 1 }, { id: 2 }],
		} satisfies JsonValue;
		setData(client, any, undefined, list);
		setData(client, any, undefined, {
			a: { b: 1 },
			list: [{ id: 1 }, { id: 3 }],
		});
		expect(getData(client, any)).toMatchObject({
			a: list.a,
			list: [list.list[0], { id: 3 }],
		});
	});

	it("keeps a `__proto__` key as data, as `JSON.parse` makes it", () => {
		const client = testClient();
		const previous: JsonValue = JSON.parse(
			'{"__proto__":{"admin":false},"id":1}',
		);
		setData(client, any, undefined, {});
		setData(client, any, undefined, previous);
		const written = getData(client, any);
		setData(
			client,
			any,
			undefined,
			JSON.parse('{"__proto__":{"admin":true},"id":1}'),
		);
		const shared = getData(client, any);

		expect(written).toEqual(previous);
		expect(Object.getPrototypeOf(shared)).toBe(Object.prototype);
		expect(Object.getOwnPropertyDescriptor(shared, "__proto__")?.value).toEqual(
			{
				admin: true,
			},
		);
		expect(Object.hasOwn(Object.prototype, "admin")).toBe(false);
	});

	it("replaces data it can't compare part by part", () => {
		const client = testClient();
		// A list with a hole at 1, which structural sharing doesn't treat as plain.
		const sparse = (): Array<number> =>
			Object.assign([], { 0: 1, 2: 3, length: 3 });
		for (const [previous, next] of [
			[new Date(0), new Date(0)],
			[sparse(), sparse()],
			[{ a: undefined }, { b: undefined }],
		]) {
			setData(client, any, undefined, previous);
			setData(client, any, undefined, next);
			expect(getData(client, any)).not.toBe(previous);
			expect(getData(client, any)).toEqual(next);
		}
	});

	it("counts the queries with a request in flight, of all or of a target", async () => {
		const cache = await cached();

		expect(isFetching(cache.client)).toBe(0);
		void invalidateAll(cache.client);
		const reader = read(
			cache.client,
			cache.backend.issueQuery,
			cache.handles.one,
		);
		expect(isFetching(cache.client)).toBe(1);
		expect(isFetching(cache.client, drafts)).toBe(0);
		expect(isFetching(cache.client, cache.backend.issueQuery)).toBe(1);
		await cache.backend.respondAll();
		reader.unmount();
	});
});
