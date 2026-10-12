import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import { QueryClient, queryOptions, type Thenable } from "./index.ts";
import { fulfilled, pending, unwrap } from "./thenable.ts";

describe("unwrap", () => {
	it("returns a fulfilled thenable's value", () => {
		expect(unwrap(fulfilled(1))).toBe(1);
	});

	it("throws a rejected thenable's reason", () => {
		const error = new Error("nope");
		const deferred = pending<number>();
		deferred.reject(error);

		expect(() => unwrap(deferred.promise)).toThrow(error);
	});

	it("throws on a pending thenable", () => {
		expect(() => unwrap(pending<number>().promise)).toThrow(/pending/);
	});

	it("narrows on status", () => {
		const thenable = fulfilled(1);
		expectTypeOf(thenable).toEqualTypeOf<Thenable<number>>();
		if (thenable.status === "fulfilled") {
			expectTypeOf(thenable.value).toEqualTypeOf<number>();
		}
	});
});

describe("Thenable", () => {
	it("types the cache's promises", () => {
		const qc = new QueryClient({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: () => 1, queryKey: ["count"] });
		qc.setData(countQuery, undefined, 1);

		const promise = qc.getQuery(countQuery).getState().promise;
		expectTypeOf(promise).toEqualTypeOf<Thenable<number>>();
		expect(promise).toMatchObject({ status: "fulfilled", value: 1 });
	});

	it("is fulfilled by the time `fetch` resolves", async () => {
		const qc = new QueryClient({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: async () => 2, queryKey: ["count"] });

		await expect(qc.fetch(countQuery)).resolves.toBe(2);
		await expect(qc.fetch(countQuery)).resolves.toBe(2);
	});
});
