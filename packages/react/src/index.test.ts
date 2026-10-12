import { describe, expect, it } from "@effect/vitest";

import { QueryCache, QueryClient, queryOptions } from "./index.ts";

describe("@raf-query/react", () => {
	it("re-exports @raf-query/core", () => {
		expect(queryOptions).toBeTypeOf("function");
	});

	it("runs QueryClient on an Effect QueryCache", () => {
		expect(new QueryClient().effect).toBeInstanceOf(QueryCache);
	});
});
