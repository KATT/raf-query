/**
 * Paging. `infiniteQueryOptions` builds ordinary query options plus a
 * `~run` function; the entry's request calls `~run(op)` instead of the
 * `queryFn` when it's set, so plain queries never load this module. Its
 * data is `{ pages, pageParams }`, and `~run` reads from the operation
 * what to do:
 *
 * - no `op.direction`: (re)load from `initialPageParam`, page after page,
 *   as many pages as the entry has, or on a first load `op.pages` (a load
 *   entry's `{ pages }`, default 1), stopping early when
 *   `getNextPageParam` returns `null` or `undefined`;
 * - `op.direction` `"next"` / `"previous"` (`fetchNextPage` /
 *   `fetchPreviousPage`): fetch one page past the end, and drop pages
 *   from the other end past `maxPages`.
 *
 * A page that returns `fail()` fails the whole request; pages loaded
 * before stay in the cache. Reading goes through `useInfiniteQuery`.
 */
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
	fail,
	getData,
	infiniteQueryOptions,
	load,
	revalidate,
	setData,
	swr,
	waterfallHandle,
} from "../index.ts";
import {
	createBackend,
	flush,
	issues,
	readPages,
	start,
	testClient,
} from "../test-utils.ts";

describe("paged queries", () => {
	it("load the first page, then the next ones until there are none", async () => {
		const backend = createBackend();
		const client = testClient();
		const view = readPages(
			client,
			backend.pageQuery,
			waterfallHandle(backend.pageQuery, { size: 4 }),
		);
		await backend.respondAll();

		expect(view.result.current[0]).toMatchObject({
			value: { pageParams: [0], pages: [[0, 1, 2, 3]] },
		});
		expect(view.result.current[1]).toMatchObject({
			hasNextPage: true,
			hasPreviousPage: false,
		});
		const [next] = await start(() => view.result.current[1].fetchNextPage());
		expect(view.result.current[1].isFetchingNextPage).toBe(true);
		await backend.respondAll();
		await next;
		await act(() => view.result.current[1].fetchPreviousPage());
		const [last] = await start(() => view.result.current[1].fetchNextPage());
		await backend.respondAll();
		await last;

		expect(view.result.current[0]).toMatchObject({
			value: { pageParams: [0, 4, 8] },
		});
		expect(view.result.current[1].hasNextPage).toBe(false);
		await act(() => view.result.current[1].fetchNextPage());
		expect(backend.requests).toHaveLength(0);
	});

	it("refetch every page they have, from the first", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			pages: revalidate(backend.pageQuery, { size: 3 }, { pages: 2 }),
		});
		await backend.respondAll();
		await backend.respondAll();
		const [handles] = await loading;
		const view = readPages(client, backend.pageQuery, handles.pages);
		const [refetch] = await start(() => view.result.current[1].refetch());
		await backend.respondAll();
		await backend.respondAll();
		await refetch;

		expect(getData(client, backend.pageQuery, { size: 3 })).toEqual({
			pageParams: [0, 3],
			pages: [
				[0, 1, 2],
				[3, 4, 5],
			],
		});
	});

	it("load as many pages as a load entry asks for, stopping at the last", async () => {
		const backend = createBackend();
		const client = testClient();
		const loading = load(client, {
			few: revalidate(backend.pageQuery, { size: 2 }, { pages: 2 }),
			many: swr(backend.pageQuery, { size: 5 }, { pages: 9 }),
		});
		for (let round = 0; round < 3; round++) {
			await backend.respondAll();
		}
		const [, data] = await loading;

		expect(data.few).toEqual({
			pageParams: [0, 2],
			pages: [
				[0, 1],
				[2, 3],
			],
		});
		expect(data.many.pageParams).toEqual([0, 5]);
	});

	it("keep at most maxPages, dropping from the other end", async () => {
		const client = testClient();
		const numbers = () =>
			infiniteQueryOptions({
				getNextPageParam: (page: number) => page + 1,
				getPreviousPageParam: (page: number) => (page > 0 ? page - 1 : null),
				initialPageParam: 1,
				maxPages: 2,
				queryFn: (context) => context.pageParam,
				queryKey: issues("numbers"),
			});
		const view = readPages(client, numbers, waterfallHandle(numbers));
		await flush();
		await act(() => view.result.current[1].fetchNextPage());
		await act(() => view.result.current[1].fetchNextPage());

		expect(view.result.current[0]).toMatchObject({
			value: { pageParams: [2, 3], pages: [2, 3] },
		});
		await act(() => view.result.current[1].fetchPreviousPage());
		await act(() => view.result.current[1].fetchPreviousPage());
		expect(view.result.current[0]).toMatchObject({ value: { pages: [0, 1] } });
		expect(view.result.current[1].hasPreviousPage).toBe(false);
	});

	it("fail with a page's fail(), keeping the pages they had", async () => {
		const client = testClient();
		const failing = (input: { readonly at: number }) =>
			infiniteQueryOptions({
				getNextPageParam: (page: number) => page + 1,
				initialPageParam: 0,
				queryFn: (context) =>
					context.pageParam === input.at
						? fail({ _tag: "Gone" })
						: context.pageParam,
				queryKey: issues("failing", input),
			});
		const atFirst = readPages(
			client,
			failing,
			waterfallHandle(failing, { at: 0 }),
		);
		const atSecond = readPages(
			client,
			failing,
			waterfallHandle(failing, { at: 1 }),
		);
		await flush();
		await act(() => atSecond.result.current[1].fetchNextPage());

		expect(atFirst.result.current[0].status).toBe("rejected");
		expect(atSecond.result.current[0]).toMatchObject({
			value: { pages: [0] },
		});
		expect(atSecond.result.current[1].error).toEqual(fail({ _tag: "Gone" }));
	});

	it("have no next page when written empty", async () => {
		const backend = createBackend();
		const client = testClient();
		setData(
			client,
			backend.pageQuery,
			{ size: 1 },
			{
				pageParams: [],
				pages: [],
			},
		);
		const view = readPages(
			client,
			backend.pageQuery,
			waterfallHandle(backend.pageQuery, { size: 1 }),
		);

		expect(view.result.current[1].hasNextPage).toBe(false);
	});
});
