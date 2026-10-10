import { describe, expect, it } from "@effect/vitest";

import { name } from "./index.ts";

describe("raf-query", () => {
	it("exports the package name", () => {
		expect(name).toBe("raf-query");
	});
});
