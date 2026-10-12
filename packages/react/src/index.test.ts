import { describe, expect, it } from "@effect/vitest";

import { watch as coreWatch } from "@raf-query/core/effect";

import { watch } from "./effect.ts";
import { QueryClient } from "./index.ts";

describe("@raf-query/react", () => {
	it("re-exports @raf-query/core", () => {
		expect(new QueryClient()).toBeInstanceOf(QueryClient);
	});

	it("re-exports @raf-query/core/effect from /effect", () => {
		expect(watch).toBe(coreWatch);
	});
});
