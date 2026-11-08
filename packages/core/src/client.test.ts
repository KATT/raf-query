import { describe, expect, it, vi } from "vitest";

import {
	createQueryClient,
	getData,
	load,
	prefetch,
	queryOptions,
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
