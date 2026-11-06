import { describe, expect, it, vi } from "vitest";

import { group, tag } from "./groups.ts";
import {
	fetchEntry,
	invalidateMany,
	load,
	queryOptions,
	waterfallHandle,
} from "./index.ts";
import {
	author,
	createBackend,
	flush,
	issues,
	read,
	testClient,
} from "./test-utils.ts";

describe("groups", () => {
	it("build flat keys under their path that survive any serializer", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			issue: fetchEntry(backend.issueQuery, { id: 1 }),
		});
		await backend.respondAll();
		const [handles] = await loading;

		expect(handles.issue.queryKey).toEqual(["issues", "byId", { id: 1 }]);
		expect(JSON.stringify(handles.issue.queryKey)).toBe(
			'["issues","byId",{"id":1}]',
		);
	});

	it("key a query by the group alone", async () => {
		const client = testClient({ staleTime: Infinity });
		let calls = 0;
		const all = () =>
			queryOptions({ queryFn: () => (calls += 1), queryKey: issues() });
		await load(client, { all: fetchEntry(all) });
		await invalidateMany(client, issues);
		await load(client, { all: fetchEntry(all) });

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
});

describe("tags", () => {
	it("build the tag string a query lists", () => {
		const label = tag("label");
		const named = tag<{ readonly name: string }>("label");

		expect([label(), named({ name: "bug" })]).toEqual([
			"label",
			'label:{"name":"bug"}',
		]);
	});

	it("don't match a query whose tags come from data it doesn't have yet", async () => {
		const backend = createBackend();
		const client = testClient();
		read(
			client,
			backend.issueQuery,
			waterfallHandle(backend.issueQuery, { id: 1 }),
		);
		const [request] = backend.requests;
		await invalidateMany(client, author);
		await flush();

		expect(backend.requests).toHaveLength(1);
		expect(request?.signal.aborted).toBe(false);
		await backend.respondAll();
	});
});
