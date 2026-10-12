import { describe, expect, it } from "@effect/vitest";

import { name } from "./index.ts";

describe("@raf-query/react", () => {
	it("re-exports @raf-query/core", () => {
		expect(name).toBe("@raf-query/core");
	});
});
