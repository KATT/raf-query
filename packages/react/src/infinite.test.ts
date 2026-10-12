import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { infiniteQueryOptions, QueryClient } from "./index.ts";

interface Page {
	readonly items: ReadonlyArray<number>;
	readonly next: number | null;
	readonly previous: number | null;
}

/** Pages of 2 numbers out of 0..9, addressed by their first number. */
function numbersQuery(input: { maxPages?: number } = {}) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: Page) => lastPage.next,
		getPreviousPageParam: (firstPage: Page) => firstPage.previous,
		initialPageParam: 4,
		maxPages: input.maxPages,
		queryFn: (context): Page => ({
			items: [context.pageParam, context.pageParam + 1],
			next: context.pageParam + 2 < 10 ? context.pageParam + 2 : null,
			previous: context.pageParam > 0 ? context.pageParam - 2 : null,
		}),
		queryKey: ["numbers", input.maxPages ?? null],
	});
}

function itemsOf(data: { readonly pages: ReadonlyArray<Page> } | undefined) {
	return data?.pages.flatMap((page) => page.items);
}

describe("paged queries", () => {
	it("load the first page, or `pages` pages up front", async () => {
		const qc = new QueryClient({ isServer: true });

		const one = await qc.fetch(numbersQuery, {});
		expect(one.pageParams).toEqual([4]);

		const fresh = new QueryClient({ isServer: true });
		const three = await fresh.fetch(numbersQuery, {}, { pages: 3 });
		expect(itemsOf(three)).toEqual([4, 5, 6, 7, 8, 9]);
	});

	it("stop loading up front at the last page", async () => {
		const qc = new QueryClient({ isServer: true });

		const data = await qc.fetch(numbersQuery, {}, { pages: 10 });

		expect(data.pageParams).toEqual([4, 6, 8]);
	});

	it("page forward and backward until the ends", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await Effect.runPromise(query.fetch());

		await Effect.runPromise(query.fetchNextPage);
		expect(itemsOf(query.getStateUnsafe().data)).toEqual([4, 5, 6, 7]);
		await Effect.runPromise(query.fetchPreviousPage);
		await Effect.runPromise(query.fetchPreviousPage);
		expect(itemsOf(query.getStateUnsafe().data)).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7,
		]);

		expect(query.hasPreviousPageUnsafe()).toBe(false);
		expect(query.hasNextPageUnsafe()).toBe(true);
		await Effect.runPromise(query.fetchNextPage);
		expect(query.hasNextPageUnsafe()).toBe(false);
		await Effect.runPromise(query.fetchNextPage);
		expect(query.getStateUnsafe().data?.pages).toHaveLength(5);
	});

	it("set fetchDirection while a page loads", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await Effect.runPromise(query.fetch());

		const next = Effect.runPromise(query.fetchNextPage);
		expect(query.getStateUnsafe().fetchDirection).toBe("forward");
		await next;
		expect(query.getStateUnsafe().fetchDirection).toBeUndefined();
	});

	it("queue a page request behind the one in flight", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});

		const first = Effect.runPromise(query.fetch());
		const next = Effect.runPromise(query.fetchNextPage);
		await first;
		await next;

		expect(query.getStateUnsafe().data?.pageParams).toEqual([4, 6]);
	});

	it("drop pages at the far end past maxPages", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, { maxPages: 2 });
		await Effect.runPromise(query.fetch());

		await Effect.runPromise(query.fetchNextPage);
		await Effect.runPromise(query.fetchNextPage);
		expect(query.getStateUnsafe().data?.pageParams).toEqual([6, 8]);

		await Effect.runPromise(query.fetchPreviousPage);
		expect(query.getStateUnsafe().data?.pageParams).toEqual([4, 6]);
	});

	it("refetch every loaded page from the first param", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await Effect.runPromise(query.fetch());
		await Effect.runPromise(query.fetchNextPage);
		await Effect.runPromise(query.fetchPreviousPage);

		await Effect.runPromise(query.refetch);

		expect(query.getStateUnsafe().data?.pageParams).toEqual([2, 4, 6]);
	});
});
