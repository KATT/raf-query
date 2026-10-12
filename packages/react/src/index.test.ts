import { describe, expect, it } from "@effect/vitest";

import { QueryClient } from "./index.ts";

describe("@raf-query/react", () => {
	it("re-exports @raf-query/core", () => {
		expect(new QueryClient()).toBeInstanceOf(QueryClient);
	});
});
