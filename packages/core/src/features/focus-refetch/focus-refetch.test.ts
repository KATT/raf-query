/**
 * `focusRefetch()` is a feature: a function of `(client, signal)` that a
 * `QueryClientProvider` calls when it mounts the client, and stops by
 * aborting `signal` when it unmounts. It listens for `visibilitychange`
 * and `focus`; when the document is visible, it refetches every query
 * that is read (has a mounted reader), enabled and stale, unless the
 * query's `meta.refetchOnWindowFocus` is `false`. The refetch is the
 * entry's ordinary request, so the data lands in the cache as usual.
 */
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { focusRefetch } from "../../index.ts";
import { advance, counted, flush, testClient } from "../../test-utils.ts";

function focus(state: DocumentVisibilityState = "visible") {
	vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
	act(() => {
		document.dispatchEvent(new Event("visibilitychange"));
		window.dispatchEvent(new Event("focus"));
	});
}

describe("focusRefetch()", () => {
	it("refetches read, stale queries when the window becomes visible", async () => {
		const counter = counted();
		const client = testClient({ features: [focusRefetch()], staleTime: 10 });
		await counter.show(client, "stale");
		advance(client, 10);
		focus("hidden");
		await flush();
		expect(counter.calls("stale")).toBe(1);

		focus();
		await flush();
		expect(counter.calls("stale")).toBe(2);
	});

	it("leaves fresh, unread and disabled queries alone, and those that opt out", async () => {
		const counter = counted();
		const client = testClient({ features: [focusRefetch()], staleTime: 10 });
		const unread = await counter.show(client, "unread");
		unread.unmount();
		await counter.show(client, "disabled");
		await counter.show(client, "opted out", { refetchOnWindowFocus: false });
		await counter.show(client, "other meta", { refetchOnReconnect: false });
		advance(client, 10);
		await counter.show(client, "fresh");
		focus();
		await flush();

		expect(
			["unread", "disabled", "opted out", "other meta", "fresh"].map(
				counter.calls,
			),
		).toEqual([1, 0, 1, 2, 1]);
	});
});
