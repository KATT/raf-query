// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createQueryClient, ensureEntry, load, queryOptions } from "./index.ts";
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
		await load(client, { count: ensureEntry(count) });
		await load(client, { count: ensureEntry(count) });

		expect(client.isServer).toBe(true);
		expect(calls).toBe(1);
	});
});
