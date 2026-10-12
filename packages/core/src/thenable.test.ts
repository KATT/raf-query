import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Effect } from "effect";

import { QueryCache, queryOptions, type Thenable } from "./index.ts";
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
		const qc = new QueryCache({ isServer: false });
		const countQuery = () =>
			queryOptions({ queryFn: () => 1, queryKey: ["count"] });
		Effect.runSync(qc.setData(countQuery, undefined, 1));

		const promise = qc.getQueryUnsafe(countQuery).getStateUnsafe().promise;
		expectTypeOf(promise).toEqualTypeOf<Thenable<number>>();
		expect(promise).toMatchObject({ status: "fulfilled", value: 1 });
	});

	it.effect("lets `fetch` succeed with data on a cache miss and a hit", () =>
		Effect.gen(function* () {
			const qc = new QueryCache({ isServer: false });
			const countQuery = () =>
				queryOptions({ queryFn: async () => 2, queryKey: ["count"] });

			expect(yield* qc.fetch(countQuery)).toBe(2);
			expect(yield* qc.fetch(countQuery)).toBe(2);
		}),
	);
});
