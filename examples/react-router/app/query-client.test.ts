import { recommended } from "@raf-query/react";
import { describe, expect, it } from "vitest";

import { createAppQueryClient } from "./query-client.ts";

describe("createAppQueryClient", () => {
	it("spreads recommended(), like the other examples", () => {
		const preset = recommended();
		const { queryClient } = createAppQueryClient(5000);

		expect(queryClient.config.links).toHaveLength(preset.links.length);
		expect(queryClient.config.features).toHaveLength(preset.features.length);
		expect(queryClient.config.staleTime).toBe(5000);
	});
});
