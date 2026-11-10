/**
 * `createQueryClient()` with no config: the system clock, a 5-minute
 * `gcTime`, and cache events through `client.subscribe`. A `queryFn` gets
 * the client making the request, which keys per-client services.
 */
import { describe, expect, it, vi } from "vitest";

import {
	createQueryClient,
	getData,
	infiniteQueryOptions,
	load,
	prefetch,
	type QueryClient,
	queryOptions,
	swr,
} from "./index.ts";
import { issues } from "./test-utils.ts";

const count = (input: { readonly name: string }) =>
	queryOptions({ queryFn: async () => 1, queryKey: issues("count", input) });

describe("a client with the defaults", () => {
	it("runs on the real clock and drops unread data after five minutes", async () => {
		vi.useFakeTimers();
		const client = createQueryClient();
		await load(client, { count: prefetch(count, { name: "a" }) });
		await vi.advanceTimersByTimeAsync(0);

		expect(client.isServer).toBe(false);
		expect(getData(client, count, { name: "a" })).toBe(1);
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
		expect(getData(client, count, { name: "a" })).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(getData(client, count, { name: "a" })).toBeUndefined();
		vi.useRealTimers();
	});
});

describe("the client making a request", () => {
	it("is in the queryFn's context, plain or paged, so it keys per-client services", async () => {
		// One "API client" per query client, as a server keeps one per request.
		const users = new WeakMap<QueryClient, string>();
		const userOf = (client: QueryClient) => users.get(client) ?? "nobody";
		const whoAmI = () =>
			queryOptions({
				queryFn: (context) => userOf(context.client),
				queryKey: issues("whoAmI"),
			});
		const pages = () =>
			infiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: (context) => `${userOf(context.client)}'s page`,
				queryKey: issues("pages"),
			});
		const ada = createQueryClient({ isServer: true });
		const bob = createQueryClient({ isServer: true });
		users.set(ada, "ada");
		users.set(bob, "bob");
		const [, adas] = await load(ada, { me: swr(whoAmI), pages: swr(pages) });
		const [, bobs] = await load(bob, { me: swr(whoAmI), pages: swr(pages) });

		expect([adas.me, adas.pages.pages]).toEqual(["ada", ["ada's page"]]);
		expect([bobs.me, bobs.pages.pages]).toEqual(["bob", ["bob's page"]]);
	});
});

describe("cache events", () => {
	it("reach a subscriber until it unsubscribes, and never one that subscribed aborted", async () => {
		const client = createQueryClient();
		const seen: Array<string> = [];
		const controller = new AbortController();
		const unsubscribe = client.subscribe((event) => seen.push(event.type), {
			signal: controller.signal,
		});
		client.subscribe(() => seen.push("aborted"), {
			signal: AbortSignal.abort(),
		})();
		await load(client, { a: prefetch(count, { name: "a" }) });
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		unsubscribe();
		const before = [...seen];
		await load(client, { b: prefetch(count, { name: "b" }) });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(before).toEqual(["added", "updated", "updated"]);
		expect(seen).toEqual(before);
	});
});
