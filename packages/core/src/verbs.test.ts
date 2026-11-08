import { assert, asyncProperty, type JsonValue, jsonValue } from "fast-check";
import { describe, expect, it } from "vitest";

import { hydrate } from "./hydration.ts";
import {
	getData,
	group,
	type InputOf,
	invalidateAll,
	invalidateMany,
	invalidateOne,
	isFetching,
	load,
	type PartialInput,
	prefetch,
	type QueryKey,
	type QueryMeta,
	queryOptions,
	removeAll,
	removeMany,
	removeOne,
	resetAll,
	resetMany,
	resetOne,
	revalidate,
	setData,
	swr,
	type Target,
} from "./index.ts";
import {
	author,
	createBackend,
	drafts,
	featured,
	flush,
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
		draft: revalidate(backend.draftQuery, { id: 3 }),
		one: revalidate(backend.issueQuery, { id: 1 }),
		two: revalidate(backend.issueQuery, { id: 2 }),
	});
	await backend.respondAll();
	const [handles] = await loading;
	/** Which of them the next revalidate entries refetch: the stale ones. */
	const refetched = async () => {
		void load(client, {
			draft: revalidate(backend.draftQuery, { id: 3 }),
			one: revalidate(backend.issueQuery, { id: 1 }),
			two: revalidate(backend.issueQuery, { id: 2 }),
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

	it("matches a hand-written key that starts with a group's path", async () => {
		const client = testClient({ staleTime: Infinity });
		let calls = 0;
		const byId = (input: { readonly id: number }) =>
			queryOptions({
				queryFn: () => (calls += 1),
				queryKey: ["issues", "byId", input.id],
			});
		await load(client, { one: revalidate(byId, { id: 1 }) });
		await invalidateMany(client, issues);
		await load(client, { one: revalidate(byId, { id: 1 }) });

		expect(calls).toBe(2);
	});

	it("matches a group by its whole name, not a prefix of it", async () => {
		const client = testClient({ staleTime: Infinity });
		let calls = 0;
		const archived = () =>
			queryOptions({
				queryFn: () => (calls += 1),
				queryKey: group("issues-archive")("list"),
			});
		await load(client, { list: revalidate(archived) });
		await invalidateMany(client, issues);
		await load(client, { list: revalidate(archived) });

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
		await load(client, { list: revalidate(list, input) });
		const refetches = async (partial: PartialInput<typeof list>) => {
			const before = calls;
			await invalidateMany(client, list, partial);
			await load(client, { list: revalidate(list, input) });
			return calls > before;
		};

		expect(await refetches({ filter: { ids: [1, 2] } })).toBe(true);
		expect(await refetches({ filter: { ids: [1] } })).toBe(false);
		expect(await refetches({ filter: { ids: [1, 3] } })).toBe(false);
		expect(await refetches({ filter: { open: false } })).toBe(false);
		expect(await refetches({ filter: { open: true } })).toBe(true);
	});

	it("matches a partial against the input, whatever the key ends with", async () => {
		const client = testClient({ staleTime: Infinity });
		const calls: Array<string> = [];
		const bySlug = (input: { readonly slug: string }) =>
			queryOptions({
				queryFn: () => calls.push(input.slug),
				queryKey: issues("bySlug", input.slug, "detail"),
			});
		const loadBoth = () =>
			load(client, {
				a: revalidate(bySlug, { slug: "a" }),
				b: revalidate(bySlug, { slug: "b" }),
			});
		const has = () =>
			["a", "b"].map((slug) => getData(client, bySlug, { slug }) !== undefined);
		await loadBoth();
		calls.length = 0;

		await invalidateMany(client, bySlug, { slug: "a" });
		await loadBoth();
		expect(calls).toEqual(["a"]);
		await invalidateMany(client, [[bySlug, { slug: "b" }]]);
		await loadBoth();
		expect(calls).toEqual(["a", "b"]);
		await resetMany(client, [[bySlug, { slug: "b" }]]);
		expect(has()).toEqual([true, false]);
		removeMany(client, bySlug, { slug: "a" });
		expect(has()).toEqual([false, false]);
	});

	it("matches a partial against a hydrated query once its factory reads it", async () => {
		const client = testClient({ staleTime: Infinity });
		const calls: Array<string> = [];
		const bySlug = (input: { readonly slug: string }) =>
			queryOptions({
				queryFn: () => calls.push(input.slug),
				queryKey: issues("bySlug", input.slug),
			});
		const entry = (slug: string) => ({
			data: 0,
			queryKey: issues("bySlug", slug),
			updatedAt: client.clock.now(),
		});
		hydrate(client, { entries: [entry("a"), entry("b")] });
		removeMany(client, bySlug, { slug: "a" });
		await invalidateMany(client, bySlug, { slug: "a" });
		await load(client, {
			a: revalidate(bySlug, { slug: "a" }),
			b: revalidate(bySlug, { slug: "b" }),
		});

		expect(calls).toEqual(["a"]);
	});

	it("matches a where target with or without its parameter", async () => {
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

	it("takes several targets in one call, each with its own argument", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, [
			[cache.backend.issueQuery, { id: 2 }],
			featured,
		]);
		expect(await cache.refetched()).toEqual(["draft", "two"]);

		await invalidateMany(cache.client, [users, [author, "ada"]]);
		expect(await cache.refetched()).toEqual(["one"]);
		await invalidateMany(cache.client, []);
		expect(await cache.refetched()).toEqual([]);
	});

	it("refetches a read query that several targets of a list cover once, and resolves when every refetch settles", async () => {
		const cache = await cached();
		const one = read(cache.client, cache.backend.issueQuery, cache.handles.one);
		const two = read(cache.client, cache.backend.issueQuery, cache.handles.two);
		let settled = false;
		const invalidating = invalidateMany(cache.client, [
			issues,
			cache.backend.issueQuery,
			[cache.backend.issueQuery, { id: 1 }],
			[author, "ada"],
		]).then(() => {
			settled = true;
		});

		expect(cache.backend.requests.map((request) => request.id)).toEqual([1, 2]);
		cache.backend.requests.shift()?.respond();
		await flush();
		expect(settled).toBe(false);
		await cache.backend.respondAll();
		await invalidating;
		expect(settled).toBe(true);
		one.unmount();
		two.unmount();
		expect(await cache.refetched()).toEqual(["draft"]);
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
		const hydrated = (queryKey: QueryKey, data: unknown) => ({
			data,
			queryKey,
			updatedAt: client.clock.now(),
		});
		hydrate(client, {
			entries: [
				hydrated(issues("byId", { id: 1 }), {
					author: "ada",
					id: 1,
					title: "Issue 1",
				}),
				hydrated(drafts("byId", { id: 3 }), "Draft 3"),
			],
		});
		// Hydrated entries have `{}` as their meta: `featured` matches the
		// draft only once `draftQuery` reads it and gives it its meta.
		await invalidateMany(client, featured);
		const loading = load(client, {
			draft: revalidate(backend.draftQuery, { id: 3 }),
			one: revalidate(backend.issueQuery, { id: 1 }),
		});

		expect(backend.requests.map((request) => request.id)).toEqual([3]);
		await backend.respondAll();
		await loading;
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe(
			"Issue 1",
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
		await resetMany(cache.client, []);
		expect(has()).toEqual([false, false, true]);
		await resetMany(cache.client, [featured, [cache.backend.issueQuery, {}]]);
		expect(has()).toEqual([false, false, false]);
		await resetAll(cache.client);
		expect(has()).toEqual([false, false, false]);
	});

	it("reset a query loading for nobody by starting it over", async () => {
		const backend = createBackend();
		const client = testClient();
		void load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });
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
		removeMany(cache.client, [drafts, [author, "ada"]]);
		expect(has()).toEqual([false, true, false]);
		const loading = load(cache.client, {
			one: swr(cache.backend.issueQuery, { id: 1 }),
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

	it("writes a query without an input, from three arguments", () => {
		const client = testClient();
		const optional = (input?: { readonly id: number }) =>
			queryOptions({
				queryFn: (): Data => null,
				queryKey: issues("optional", input),
			});
		setData(client, any, [1]);
		setData(client, any, (previous) => [
			...(Array.isArray(previous) ? previous : []),
			2,
		]);
		setData(client, optional, "none");
		setData(client, optional, { id: 1 }, "one");

		expect(getData(client, any)).toEqual([1, 2]);
		expect(getData(client, optional)).toBe("none");
		expect(getData(client, optional, { id: 1 })).toBe("one");
	});

	it("reads nothing for a query that is cached without data", async () => {
		const backend = createBackend();
		const client = testClient();
		void load(client, { issue: prefetch(backend.issueQuery, { id: 1 }) });

		expect(getData(client, backend.issueQuery, { id: 1 })).toBeUndefined();
		await backend.respondAll();
	});

	it("keeps the identity of every part of new data that equals the old", async () => {
		await assert(
			asyncProperty(jsonValue(), jsonValue(), async (previous, next) => {
				const client = testClient();
				setData(client, any, previous);
				setData(client, any, structuredClone(next));
				const written = getData(client, any);
				setData(client, any, structuredClone(next));

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
		setData(client, any, list);
		setData(client, any, {
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
		setData(client, any, {});
		setData(client, any, previous);
		const written = getData(client, any);
		setData(client, any, JSON.parse('{"__proto__":{"admin":true},"id":1}'));
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
			setData(client, any, previous);
			setData(client, any, next);
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
