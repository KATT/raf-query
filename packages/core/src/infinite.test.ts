import { describe, expect, it } from "vitest";

import { entryOf, fetchEntry } from "./entry.ts";
import { fail } from "./fail.ts";
import { infiniteQueryOptions, pageParamAfter } from "./infinite.ts";
import { createBackend, flush, issues, testClient } from "./test-utils.ts";

async function settle(backend: ReturnType<typeof createBackend>) {
	for (let round = 0; round < 10; round++) {
		await flush();
		backend.respondAll();
	}
}

describe("paged queries", () => {
	it("load the first page, then the next and previous ones", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.pageQuery, { size: 2 });
		const first = fetchEntry(entry);
		await settle(backend);
		await first;

		expect(entry.state.data).toEqual({ pageParams: [0], pages: [[0, 1]] });
		const next = fetchEntry(entry, { direction: "next" });

		expect(entry.state.fetchingDirection).toBe("next");
		await settle(backend);
		await next;
		expect(entry.state.data).toEqual({
			pageParams: [0, 2],
			pages: [
				[0, 1],
				[2, 3],
			],
		});
		await fetchEntry(entry, { direction: "previous" });
		expect(entry.state.data).toMatchObject({ pageParams: [0, 2] });
	});

	it("refetch every page they have, from the first", async () => {
		const backend = createBackend();
		const client = testClient();
		const entry = entryOf(client, backend.pageQuery, { size: 5 });
		const first = fetchEntry(entry, { pages: 3 });
		await settle(backend);
		await first;

		expect(entry.state.data).toEqual({
			pageParams: [0, 5],
			pages: [
				[0, 1, 2, 3, 4],
				[5, 6, 7, 8, 9],
			],
		});
		const refetch = fetchEntry(entry);
		await settle(backend);
		await refetch;
		expect(entry.state.data).toMatchObject({ pageParams: [0, 5] });
		await fetchEntry(entry, { direction: "next" });
		expect(backend.requests).toHaveLength(0);
	});

	it("keep at most maxPages, dropping from the other end", async () => {
		const client = testClient();
		const numbers = () =>
			infiniteQueryOptions({
				getNextPageParam: (page: number) => page + 1,
				getPreviousPageParam: (page: number) => page - 1,
				initialPageParam: 5,
				maxPages: 2,
				queryFn: (context) => context.pageParam,
				queryKey: [issues, "numbers"],
			});
		const entry = entryOf(client, numbers, undefined);
		await fetchEntry(entry);
		await fetchEntry(entry, { direction: "next" });
		await fetchEntry(entry, { direction: "next" });

		expect(entry.state.data).toEqual({ pageParams: [6, 7], pages: [6, 7] });
		await fetchEntry(entry, { direction: "previous" });
		expect(entry.state.data).toEqual({ pageParams: [5, 6], pages: [5, 6] });
	});

	it("fail with a page's fail()", async () => {
		const client = testClient();
		const failing = (input: { readonly at: number }) =>
			infiniteQueryOptions({
				getNextPageParam: (page: number) => page + 1,
				initialPageParam: 0,
				queryFn: (context) =>
					context.pageParam === input.at
						? fail({ _tag: "Gone" })
						: context.pageParam,
				queryKey: [issues, "failing", input],
			});
		const atFirst = entryOf(client, failing, { at: 0 });
		const atSecond = entryOf(client, failing, { at: 1 });
		await fetchEntry(atFirst);
		await fetchEntry(atSecond);
		await fetchEntry(atSecond, { direction: "next" });

		expect(atFirst.state.status).toBe("error");
		expect(atSecond.state).toMatchObject({
			data: { pages: [0] },
			status: "error",
		});
	});

	it("have no page before the first without getPreviousPageParam", () => {
		const options = { getNextPageParam: () => undefined };

		expect(
			pageParamAfter(options, { pageParams: [0], pages: [1] }, "previous"),
		).toBeUndefined();
		expect(
			pageParamAfter(options, { pageParams: [], pages: [] }, "next"),
		).toBeUndefined();
		expect(
			pageParamAfter(options, { pageParams: [0], pages: [1] }, "next"),
		).toBeUndefined();
	});
});
