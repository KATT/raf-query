import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Data, Effect, type Option } from "effect";

import {
	type DataOf,
	type ErrorOf,
	hashKey,
	type InfiniteData,
	infiniteQueryOptions,
	matchesKey,
	Query,
	type QueryHandle,
	queryOptions,
} from "./index.ts";
import { makeCacheUnsafe } from "./test-utils.ts";

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

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: number }> {}

function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => Promise.resolve({ slug: input.slug, title: "Hello" }),
		queryKey: ["post", input.slug],
	});
}

function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			input.id > 0
				? Effect.succeed({ id: input.id })
				: Effect.fail(new NotFound({ id: input.id })),
		queryKey: ["issue", input.id],
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
		const cache = makeCacheUnsafe({ isServer: true });

		expectTypeOf(cache.prefetch(postQuery, { slug: "a" })).toEqualTypeOf<
			Effect.Effect<QueryHandle<typeof postQuery>>
		>();
		expectTypeOf(cache.fetch(postQuery, { slug: "a" })).toEqualTypeOf<
			Effect.Effect<{ slug: string; title: string }, unknown>
		>();
		expectTypeOf(cache.getData(postQuery, { slug: "a" })).toEqualTypeOf<
			Effect.Effect<Option.Option<{ slug: string; title: string }>>
		>();
		expectTypeOf<DataOf<typeof commentsQuery>>().toEqualTypeOf<
			InfiniteData<{ next: number | null }, number>
		>();
		expectTypeOf(
			Effect.runSync(cache.prefetch(meQuery)).input,
		).toEqualTypeOf<undefined>();
	});

	it("keep an Effect queryFn's error type", () => {
		const cache = makeCacheUnsafe({ isServer: true });

		expectTypeOf<DataOf<typeof issueQuery>>().toEqualTypeOf<{ id: number }>();
		expectTypeOf<ErrorOf<typeof issueQuery>>().toEqualTypeOf<NotFound>();
		expectTypeOf<ErrorOf<typeof postQuery>>().toEqualTypeOf<unknown>();
		expectTypeOf(cache.fetch(issueQuery, { id: 1 })).toEqualTypeOf<
			Effect.Effect<{ id: number }, NotFound | Query.CancelledError>
		>();
		expectTypeOf(
			Query.fetch(cache.getQueryUnsafe(issueQuery, { id: 1 })),
		).toEqualTypeOf<
			Effect.Effect<{ id: number }, NotFound | Query.CancelledError>
		>();
	});

	it("reject wrong inputs and paging options on plain factories", () => {
		const cache = makeCacheUnsafe({ isServer: true });
		const typeOnly = () => {
			// @ts-expect-error the input is required
			cache.prefetch(postQuery);
			// @ts-expect-error wrong input shape
			cache.prefetch(postQuery, { id: 1 });
			// @ts-expect-error `pages` is only for paged factories
			cache.ensure(postQuery, { slug: "a" }, { pages: 2 });
			cache.ensure(commentsQuery, { slug: "a" }, { pages: 2 });
			// @ts-expect-error wrong input shape
			cache.invalidate(postQuery, { id: 1 });
			cache.invalidate({ queryKey: ["post"] });
			// @ts-expect-error factories take at most one argument
			cache.prefetch((a: string, b: string) => postQuery({ slug: a + b }), "a");
		};
		expect(typeOnly).toBeTypeOf("function");
	});
});
