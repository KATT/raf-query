/**
 * Keys and groups. A key is a plain array; the cache stores an entry under
 * `hashKey(key)`, JSON with object fields sorted. `group("posts")` and
 * `group(posts, "drafts")` are functions that build keys under their path:
 * `drafts("byId", input)` is `["posts", "drafts", "byId", input]`. Passed
 * to a verb, a group records a stamp with its path, and matches every
 * entry whose key starts with that path, whoever built the key. In
 * development, a group throws when a subgroup and a query under one
 * parent share a name, since invalidating the subgroup would reach the
 * query.
 */
import { describe, expect, it, vi } from "vitest";

import { group, invalidateMany, load, revalidate } from "../index.ts";
import {
	cached,
	createBackend,
	drafts,
	issues,
	queryOptions,
	testClient,
	users,
} from "../test-utils.ts";

describe("groups", () => {
	it("build flat keys under their path that survive any serializer", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: revalidate(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		const [handles] = await loading;

		expect(handles.issue.queryKey).toEqual(["issues", "byId", { id: 1 }]);
		expect(JSON.stringify(handles.issue.queryKey)).toBe(
			'["issues","byId",{"id":1}]',
		);
	});

	it("key a query by the group alone", async () => {
		const client = testClient({ defaults: { staleTime: Infinity } });
		let calls = 0;
		const all = () =>
			queryOptions({ queryFn: () => (calls += 1), queryKey: issues() });
		await load(client, { all: revalidate(all) });
		await invalidateMany(client, issues);
		await load(client, { all: revalidate(all) });

		expect(calls).toBe(2);
	});

	it("throw in development when a subgroup and a query share a name", () => {
		const posts = group("posts");
		posts("drafts");
		expect(() => group(posts, "drafts")).toThrow(
			'raf-query: "posts/drafts" is both a subgroup and a query key. Give one of them another name.',
		);

		group(posts, "pages");
		expect(() => posts("pages")).toThrow(/"posts\/pages" is both/);
	});

	it("skip the name check in production builds", () => {
		vi.stubEnv("NODE_ENV", "production");
		const posts = group("posts");
		posts("drafts");

		expect(group(posts, "drafts")("byId")).toEqual(["posts", "drafts", "byId"]);
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
		const client = testClient({ defaults: { staleTime: Infinity } });
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
		const client = testClient({ defaults: { staleTime: Infinity } });
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
});
