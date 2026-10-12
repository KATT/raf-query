import { describe, expect, it } from "@effect/vitest";

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
		await query.fetch();

		await query.fetchNextPage();
		expect(itemsOf(query.getState().data)).toEqual([4, 5, 6, 7]);
		await query.fetchPreviousPage();
		await query.fetchPreviousPage();
		expect(itemsOf(query.getState().data)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

		expect(query.hasPreviousPage()).toBe(false);
		expect(query.hasNextPage()).toBe(true);
		await query.fetchNextPage();
		expect(query.hasNextPage()).toBe(false);
		await query.fetchNextPage();
		expect(query.getState().data?.pages).toHaveLength(5);
	});

	it("set fetchDirection while a page loads", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await query.fetch();

		const next = query.fetchNextPage();
		expect(query.getState().fetchDirection).toBe("forward");
		await next;
		expect(query.getState().fetchDirection).toBeUndefined();
	});

	it("queue a page request behind the one in flight", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});

		const first = query.fetch();
		const next = query.fetchNextPage();
		await first;
		await next;

		expect(query.getState().data?.pageParams).toEqual([4, 6]);
	});

	it("drop pages at the far end past maxPages", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, { maxPages: 2 });
		await query.fetch();

		await query.fetchNextPage();
		await query.fetchNextPage();
		expect(query.getState().data?.pageParams).toEqual([6, 8]);

		await query.fetchPreviousPage();
		expect(query.getState().data?.pageParams).toEqual([4, 6]);
	});

	it("refetch every loaded page from the first param", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await query.fetch();
		await query.fetchNextPage();
		await query.fetchPreviousPage();

		await query.refetch();

		expect(query.getState().data?.pageParams).toEqual([2, 4, 6]);
	});
});
