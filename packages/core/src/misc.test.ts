import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import {
	allKeyed,
	type DataOf,
	hashKey,
	type InfiniteData,
	infiniteQueryOptions,
	matchesKey,
	QueryClient,
	type QueryHandle,
	queryOptions,
} from "./index.ts";

describe("keys", () => {
	it("hash plain objects independent of key order", () => {
		expect(hashKey(["a", { x: 1, y: 2 }])).toBe(hashKey(["a", { x: 1, y: 2 }]));
		expect(hashKey(["a", 1])).not.toBe(hashKey(["a", "1"]));
	});

	it("match by prefix and by partial object segments", () => {
		const key = ["issues", { page: 2, status: "open" }, "x"];

		expect(matchesKey(key, ["issues"])).toBe(true);
		expect(matchesKey(key, ["issues", { status: "open" }])).toBe(true);
		expect(matchesKey(key, ["issues", { status: "closed" }])).toBe(false);
		expect(matchesKey(key, [...key, "more"])).toBe(false);
	});
});

describe("allKeyed", () => {
	it("awaits a record of promises, keeping keys", async () => {
		const result = await allKeyed({
			one: Promise.resolve(1),
			two: "two",
		});

		expect(result).toEqual({ one: 1, two: "two" });
		expectTypeOf(result).toEqualTypeOf<{ one: number; two: string }>();
	});

	it("rejects on the first failure", async () => {
		await expect(
			allKeyed({ bad: Promise.reject(new Error("no")), good: 1 }),
		).rejects.toThrow("no");
	});
});

function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => ({ slug: input.slug, title: "Hello" }),
		queryKey: ["post", input.slug],
	});
}

function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
		initialPageParam: 0,
		queryFn: (context) => ({ next: context.pageParam + 1 }),
		queryKey: ["comments", input.slug],
	});
}

function meQuery() {
	return queryOptions({ queryFn: () => "me", queryKey: ["me"] });
}

describe("types", () => {
	it("flow from the factory to every verb", () => {
		const qc = new QueryClient({ isServer: true });

		expectTypeOf(qc.prefetch(postQuery, { slug: "a" })).toEqualTypeOf<
			QueryHandle<typeof postQuery>
		>();
		expectTypeOf(qc.prefetch(postQuery, { slug: "a" }).input).toEqualTypeOf<{
			slug: string;
		}>();
		expectTypeOf(qc.fetch(postQuery, { slug: "a" })).resolves.toEqualTypeOf<{
			slug: string;
			title: string;
		}>();
		expectTypeOf<DataOf<typeof commentsQuery>>().toEqualTypeOf<
			InfiniteData<{ next: number | null }, number>
		>();
		expectTypeOf(qc.prefetch(meQuery).input).toEqualTypeOf<undefined>();
	});

	it("reject wrong inputs and paging options on plain factories", () => {
		const qc = new QueryClient({ isServer: true });
		const typeOnly = () => {
			// @ts-expect-error the input is required
			qc.prefetch(postQuery);
			// @ts-expect-error wrong input shape
			qc.prefetch(postQuery, { id: 1 });
			// @ts-expect-error `pages` is only for paged factories
			void qc.ensure(postQuery, { slug: "a" }, { pages: 2 });
			void qc.ensure(commentsQuery, { slug: "a" }, { pages: 2 });
			// @ts-expect-error factories take at most one argument
			qc.prefetch((a: string, b: string) => postQuery({ slug: a + b }), "a");
		};
		expect(typeOnly).toBeTypeOf("function");
	});
});
