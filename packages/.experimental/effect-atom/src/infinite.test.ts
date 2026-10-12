import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { QueryClient } from "./client.ts";
import * as Entry from "./entry.ts";
import { infiniteQueryOptions } from "./options.ts";

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

function paramsOf(client: QueryClient, input: { maxPages?: number } = {}) {
	return client.getData(numbersQuery, input)?.pageParams;
}

describe("paged queries", () => {
	test("load the first page, or `pages` pages up front", async () => {
		const client = new QueryClient({ isServer: true });
		const one = await client.fetch(numbersQuery, {});
		expect(one.pageParams).toEqual([4]);

		const fresh = new QueryClient({ isServer: true });
		const three = await fresh.fetch(numbersQuery, {}, { pages: 3 });
		expect(itemsOf(three)).toEqual([4, 5, 6, 7, 8, 9]);
	});

	test("stop loading up front at the last page", async () => {
		const client = new QueryClient({ isServer: true });
		const data = await client.fetch(numbersQuery, {}, { pages: 10 });
		expect(data.pageParams).toEqual([4, 6, 8]);
	});

	test("page forward and backward until the ends", async () => {
		const client = new QueryClient({ isServer: false });
		await client.fetch(numbersQuery, {});
		const entry = client.effect.getQueryUnsafe(numbersQuery, {});
		const result = () => client.registry.get(entry.data);

		await client.fetchNextPage(numbersQuery, {});
		expect(itemsOf(client.getData(numbersQuery, {}))).toEqual([4, 5, 6, 7]);
		await client.fetchPreviousPage(numbersQuery, {});
		await client.fetchPreviousPage(numbersQuery, {});
		expect(itemsOf(client.getData(numbersQuery, {}))).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7,
		]);

		expect(Entry.hasPreviousPageUnsafe(entry, result())).toBe(false);
		expect(Entry.hasNextPageUnsafe(entry, result())).toBe(true);
		await client.fetchNextPage(numbersQuery, {});
		expect(Entry.hasNextPageUnsafe(entry, result())).toBe(false);
		await client.fetchNextPage(numbersQuery, {});
		expect(client.getData(numbersQuery, {})?.pages).toHaveLength(5);
	});

	test("set fetchDirection while a page loads", async () => {
		const client = new QueryClient({ isServer: false });
		await client.fetch(numbersQuery, {});
		const entry = client.effect.getQueryUnsafe(numbersQuery, {});

		const next = client.fetchNextPage(numbersQuery, {});
		expect(Entry.isFetchingUnsafe(entry)).toBe(true);
		expect(entry.fetchDirection).toBe("forward");
		await next;
		expect(Entry.isFetchingUnsafe(entry)).toBe(false);
	});

	test("queue a page request behind the one in flight", async () => {
		const client = new QueryClient({ isServer: false });
		const first = client.fetch(numbersQuery, {});
		const next = client.fetchNextPage(numbersQuery, {});
		await first;
		await next;
		expect(paramsOf(client)).toEqual([4, 6]);
	});

	test("drop pages at the far end past maxPages", async () => {
		const client = new QueryClient({ isServer: false });
		const input = { maxPages: 2 };
		await client.fetch(numbersQuery, input);

		await client.fetchNextPage(numbersQuery, input);
		await client.fetchNextPage(numbersQuery, input);
		expect(paramsOf(client, input)).toEqual([6, 8]);

		await client.fetchPreviousPage(numbersQuery, input);
		expect(paramsOf(client, input)).toEqual([4, 6]);
	});

	test("refetch every loaded page from the first param", async () => {
		const client = new QueryClient({ isServer: false });
		await client.fetch(numbersQuery, {});
		await client.fetchNextPage(numbersQuery, {});
		await client.fetchPreviousPage(numbersQuery, {});

		const entry = client.effect.getQueryUnsafe(numbersQuery, {});
		await entry.refetch();

		expect(paramsOf(client)).toEqual([2, 4, 6]);
	});

	test("are atoms with a typed page", async () => {
		const client = new QueryClient({ isServer: false });
		const pages = await Effect.runPromise(
			client.effect.fetch(numbersQuery, {}, { pages: 2 }),
		);
		const first: Page | undefined = pages.pages[0];
		expect(first?.items).toEqual([4, 5]);
	});
});
