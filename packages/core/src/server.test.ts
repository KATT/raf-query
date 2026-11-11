// @vitest-environment node
/**
 * Without a `window`, a client is a server client: it never collects
 * garbage and never revalidates what it has cached, for the whole request.
 * It never starts a query with `ssr: false`: only a browser can run it.
 */
import { describe, expect, it } from "vitest";

import { dehydrate } from "./hydration/hydration.ts";
import {
	createQueryClient,
	invalidateOne,
	load,
	prefetch,
	resetOne,
	revalidate,
	setData,
	swr,
} from "./index.ts";
import { issues, queryOptions } from "./test-utils.ts";

/** A query only a browser can run, counting its requests. */
function browserOnly() {
	let calls = 0;
	const pushState = (input: { readonly slug: string }) =>
		queryOptions({
			queryFn: async () => {
				calls += 1;
				return "on";
			},
			queryKey: issues("pushState", input.slug),
			ssr: false,
		});
	return { calls: () => calls, pushState };
}

describe("a client created without a window", () => {
	it("is a server client: it keeps what it loaded for the whole request", async () => {
		let calls = 0;
		const count = () =>
			queryOptions({
				queryFn: async () => (calls += 1),
				queryKey: issues("count"),
			});
		const client = createQueryClient();
		await load(client, { count: swr(count) });
		await load(client, { count: swr(count) });

		expect(client.isServer).toBe(true);
		expect(calls).toBe(1);
	});
});

describe("a query with ssr: false on a server client", () => {
	it("never starts, and sends nothing, but a prefetch gets its handle", async () => {
		const query = browserOnly();
		const client = createQueryClient();
		const [handles] = await load(client, {
			push: prefetch(query.pushState, { slug: "hello" }),
		});
		await invalidateOne(client, query.pushState, { slug: "hello" });
		await resetOne(client, query.pushState, { slug: "hello" });

		expect(handles.push).toEqual({
			input: { slug: "hello" },
			queryKey: ["issues", "pushState", "hello"],
		});
		expect(query.calls()).toBe(0);
		expect(dehydrate(client).entries).toEqual([]);
	});

	it("can't be waited for, unless the cache has its data", async () => {
		const query = browserOnly();
		const client = createQueryClient();

		await expect(
			load(client, { push: swr(query.pushState, { slug: "hello" }) }),
		).rejects.toThrow(
			'issues","pushState","hello"] has `ssr: false`, so the server can\'t wait for it. Load it with prefetch() instead of swr().',
		);
		await expect(
			load(client, { push: revalidate(query.pushState, { slug: "hello" }) }),
		).rejects.toThrow("instead of revalidate()");
		setData(client, query.pushState, { slug: "hello" }, "off");
		const [, data] = await load(client, {
			push: revalidate(query.pushState, { slug: "hello" }),
		});
		expect(data.push).toBe("off");
		expect(query.calls()).toBe(0);
	});

	it("runs as usual on a browser client", async () => {
		const query = browserOnly();
		const client = createQueryClient({ isServer: false });
		const [, data] = await load(client, {
			push: swr(query.pushState, { slug: "hello" }),
		});

		expect(data.push).toBe("on");
		expect(query.calls()).toBe(1);
	});
});
