/**
 * `reconnectRefetch()` is a feature (see `../focus-refetch/` for how
 * features run). It listens for `online` on `window` and refetches every
 * read, enabled, stale query, unless its `meta.refetchOnReconnect` is
 * `false`. It shares that sweep with `focusRefetch()` (`../shared.ts`).
 */
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { reconnectRefetch } from "../../index.ts";
import { counted, flush, testClient } from "../../test-utils.ts";

describe("reconnectRefetch()", () => {
	it("refetches read, stale queries when the browser comes back online", async () => {
		const counter = counted();
		const client = testClient({ features: [reconnectRefetch()] });
		await counter.show(client, "stale");
		await counter.show(client, "opted out", { refetchOnReconnect: false });
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await flush();

		expect(counter.calls("stale")).toBe(2);
		expect(counter.calls("opted out")).toBe(1);
	});
});
