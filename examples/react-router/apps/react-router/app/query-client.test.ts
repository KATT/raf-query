import { recommended } from "@raf-query/react";
import { describe, expect, it } from "vitest";

import { createAppQueryClient } from "./query-client.ts";

describe("createAppQueryClient", () => {
	it("has the recommended() parts, like the other examples", () => {
		const app = createAppQueryClient(5000);

		expect(app.queryClient.config.parts).toHaveLength(recommended().length);
		expect(app.queryClient.config.defaults).toBe(app.queryDefaults);
		expect(app.queryDefaults.staleTime).toBe(5000);
	});
});
