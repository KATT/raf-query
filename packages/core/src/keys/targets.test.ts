/**
 * Targets: what the `…Many` verbs (and `useIsFetching`) take. A verb
 * turns each target into a stamp at the client's next sequence number,
 * and an entry is invalidated while a matching stamp is newer than the
 * request its data came from. Read entries refetch at once; the rest are
 * checked when they're next read, which always goes through their
 * factory, so a target sees their input and options by then.
 *
 * - A factory matches the entries it made, by identity; with a partial
 *   input, only those whose input has those fields (objects partially,
 *   arrays whole), never the key.
 * - A group matches by key prefix (`./keys.test.ts`).
 * - Any object with `where(query, param)` matches what `where` returns
 *   `true` for. `query` has the entry's `queryKey`, `input`, `options` and
 *   `data`; `param` is what the verb was called with.
 * - A list matches what any of its targets match, each with its own
 *   argument.
 *
 * An entry that was only hydrated has no factory, input or options until
 * something reads it through its factory.
 */
import { describe, expect, it } from "vitest";

import { hydrate } from "../hydration/hydration.ts";
import {
	getData,
	type InputOf,
	invalidateMany,
	load,
	type PartialInput,
	type QueryKey,
	queryOptions,
	removeMany,
	resetMany,
	revalidate,
	type Target,
} from "../index.ts";
import {
	author,
	cached,
	createBackend,
	drafts,
	featured,
	issues,
	testClient,
	users,
} from "../test-utils.ts";

describe("targets", () => {
	it("matches a factory's queries, optionally by part of their input", async () => {
		const cache = await cached();
		await invalidateMany(cache.client, cache.backend.issueQuery, { id: 2 });
		expect(await cache.refetched()).toEqual(["two"]);

		await invalidateMany(cache.client, cache.backend.issueQuery);
		expect(await cache.refetched()).toEqual(["one", "two"]);
	});

	it("matches part of an input with nested objects and arrays", async () => {
		const client = testClient({ defaults: { staleTime: Infinity } });
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
		const client = testClient({ defaults: { staleTime: Infinity } });
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
		const client = testClient({ defaults: { staleTime: Infinity } });
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
		const byTitle: Target<object, string> = {
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

	it("applies invalidations to hydrated queries once a factory reads them", async () => {
		const backend = createBackend();
		const client = testClient({ defaults: { staleTime: Infinity } });
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
		// Hydrated entries have `{}` as their options: `featured` matches the
		// draft only once `draftQuery` reads it and gives it its options.
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
