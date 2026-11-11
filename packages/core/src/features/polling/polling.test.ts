/**
 * `polling()` is a feature (see `../focus-refetch/` for how features run).
 * It subscribes to the client's events and keeps one timer per entry, on
 * the client's `Clock`: an entry gets a timer while it has readers and its
 * `refetchInterval` is a positive number, and loses it when its last
 * reader leaves, when it's removed, or when the feature stops. Each tick
 * starts the entry's request (joining one in flight) and schedules the
 * next, whether or not the data is stale.
 */
import { useQuery } from "@raf-query/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { Polling } from "./polling.ts";
import { polling, removeOne, waterfallHandle } from "../../index.ts";
import {
	advance,
	counted,
	flush,
	mount,
	testClient,
} from "../../test-utils.ts";

describe("polling()", () => {
	it("refetches a read query every refetchInterval, until nothing reads it", async () => {
		const counter = counted();
		const client = testClient({ parts: [polling()] });
		const handle = waterfallHandle(counter.query, {
			name: "polled",
			options: { refetchInterval: 100 },
		});
		function Poll() {
			useQuery(counter.query, handle);
			return null;
		}
		const app = mount(client, createElement(Poll));
		await flush();
		advance(client, 100);
		await flush();
		app.rerender([
			createElement(Poll, { key: 1 }),
			createElement(Poll, { key: 2 }),
		]);
		advance(client, 100);
		await flush();

		expect(counter.calls("polled")).toBe(3);
		app.unmount();
		advance(client, 500);
		expect(counter.calls("polled")).toBe(3);
	});

	it("stops for a query that is removed or no longer read", async () => {
		const counter = counted();
		const client = testClient({ parts: [polling()] });
		await counter.show(client, "removed", { refetchInterval: 100 });
		const left = await counter.show(client, "left", { refetchInterval: 100 });
		removeOne(client, counter.query, { name: "removed" });
		left.unmount();
		advance(client, 500);

		expect(counter.calls("removed")).toBe(1);
		expect(counter.calls("left")).toBe(1);
	});

	it("leaves queries without an interval alone", async () => {
		const counter = counted();
		const client = testClient({ parts: [polling()] });
		const intervals: Array<Polling["options"]["refetchInterval"]> = [
			undefined,
			false,
			0,
		];
		for (const refetchInterval of intervals) {
			// oxlint-disable-next-line no-await-in-loop -- one query at a time
			await counter.show(client, String(refetchInterval), { refetchInterval });
		}
		advance(client, 500);

		expect(["undefined", "false", "0"].map(counter.calls)).toEqual([1, 1, 1]);
	});

	it("polls at the client's default interval, unless the query sets its own", async () => {
		const counter = counted();
		const client = testClient({
			defaults: { refetchInterval: 100 },
			parts: [polling()],
		});
		await counter.show(client, "default");
		await counter.show(client, "off", { refetchInterval: false });
		advance(client, 100);
		await flush();
		advance(client, 100);
		await flush();

		expect(["default", "off"].map(counter.calls)).toEqual([3, 1]);
	});
});
