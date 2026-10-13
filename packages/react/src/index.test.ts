import { describe, expect, it } from "@effect/vitest";

import { QueryCache as EffectQueryCache } from "./effect.ts";
import { QueryCache, QueryClient, queryOptions } from "./index.ts";

describe("@raf-query/react", () => {
	it("re-exports @raf-query/core", () => {
		expect(queryOptions).toBeTypeOf("function");
	});

	it("runs QueryClient on a QueryCache that /effect can view", () => {
		const qc = new QueryClient();

		expect(QueryCache.isQueryCache(qc.cache)).toBe(true);
		expect(
			EffectQueryCache.isQueryCache(EffectQueryCache.fromCache(qc.cache)),
		).toBe(true);
	});
});
