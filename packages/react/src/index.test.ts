import { describe, expect, it } from "@effect/vitest";

import { effectQueryOptions as coreEffectQueryOptions } from "@raf-query/core/effect";

import { effectQueryOptions } from "./effect.ts";
import { QueryClient } from "./index.ts";

describe("@raf-query/react", () => {
	it("re-exports @raf-query/core", () => {
		expect(new QueryClient()).toBeInstanceOf(QueryClient);
	});

	it("re-exports @raf-query/core/effect from /effect", () => {
		expect(effectQueryOptions).toBe(coreEffectQueryOptions);
	});
});
