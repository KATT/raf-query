// @vitest-environment node
/**
 * Without a `window`, a client is a server client: it never collects
 * garbage and never revalidates what it has cached, for the whole request.
 */
import { describe, expect, it } from "vitest";

import { createQueryClient, load, queryOptions, swr } from "./index.ts";
import { issues } from "./test-utils.ts";

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
