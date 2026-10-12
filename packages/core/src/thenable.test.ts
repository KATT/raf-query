import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import { QueryClient, queryOptions, type Thenable } from "./index.ts";
import { fulfilled } from "./thenable.ts";

describe("Thenable", () => {
	it("narrows on status", () => {
		const thenable = fulfilled(1);
		expectTypeOf(thenable).toEqualTypeOf<Thenable<number>>();
		if (thenable.status === "fulfilled") {
			expectTypeOf(thenable.value).toEqualTypeOf<number>();
		}
	});

	it("types the cache's promises", () => {
		const qc = new QueryClient({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: () => 1, queryKey: ["count"] });
		qc.setData(countQuery, undefined, 1);

		const promise = qc.getQuery(countQuery).getState().promise;
		expectTypeOf(promise).toEqualTypeOf<Thenable<number>>();
		expect(promise).toMatchObject({ status: "fulfilled", value: 1 });
	});

	it("lets `fetch` resolve to data on a cache miss and a hit", async () => {
		const qc = new QueryClient({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: async () => 2, queryKey: ["count"] });

		await expect(qc.fetch(countQuery)).resolves.toBe(2);
		await expect(qc.fetch(countQuery)).resolves.toBe(2);
	});
});
