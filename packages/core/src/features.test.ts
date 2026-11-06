import { useQuery } from "@raf-query/react";
import { act } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { groups } from "./groups.ts";
import {
	action,
	focusRefetch,
	type FocusRefetchMeta,
	invalidateOnAction,
	polling,
	type PollingMeta,
	type QueryClient,
	queryOptions,
	reconnectRefetch,
	type ReconnectRefetchMeta,
	removeOne,
	waterfallHandle,
} from "./index.ts";
import {
	advance,
	flush,
	issues,
	mount,
	read,
	testClient,
	users,
} from "./test-utils.ts";

type Meta = {
	readonly refetchInterval?: PollingMeta["refetchInterval"];
	readonly refetchOnReconnect?: ReconnectRefetchMeta["refetchOnReconnect"];
	readonly refetchOnWindowFocus?: FocusRefetchMeta["refetchOnWindowFocus"];
};

/** Queries that count their requests, each with its own `meta`. */
function counted() {
	const calls = new Map<string, number>();
	const query = (input: { readonly meta?: Meta; readonly name: string }) =>
		queryOptions({
			enabled: input.name !== "disabled",
			meta: input.meta,
			queryFn: () => {
				const count = (calls.get(input.name) ?? 0) + 1;
				calls.set(input.name, count);
				return count;
			},
			queryKey: issues("counted", input.name),
		});
	/** Read the named query in a component, under its own provider; it loads at once. */
	const show = async (client: QueryClient, name: string, meta?: Meta) => {
		const reader = read(client, query, waterfallHandle(query, { meta, name }));
		await flush();
		return reader;
	};
	return { calls: (name: string) => calls.get(name) ?? 0, query, show };
}

function focus(state: DocumentVisibilityState = "visible") {
	vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
	act(() => {
		document.dispatchEvent(new Event("visibilitychange"));
		window.dispatchEvent(new Event("focus"));
	});
}

describe("focus refetching", () => {
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

describe("reconnect refetching", () => {
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

describe("polling", () => {
	it("refetches a read query every refetchInterval, until nothing reads it", async () => {
		const counter = counted();
		const client = testClient({ features: [polling(), groups()] });
		const handle = waterfallHandle(counter.query, {
			meta: { refetchInterval: 100 },
			name: "polled",
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
		const client = testClient({ features: [polling()] });
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
		const client = testClient({ features: [polling()] });
		const intervals: Array<PollingMeta["refetchInterval"]> = [
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
});

describe("actions", () => {
	it("invalidate what they name, and resolve once the refetches settle", async () => {
		const counter = counted();
		const client = testClient({ features: [invalidateOnAction()] });
		await counter.show(client, "issues");
		const save = action(async (title: string) => title.toUpperCase(), {
			invalidates: [issues],
		});
		const other = action(async () => {}, { invalidates: [users] });

		await act(async () => {
			expect(await save("done")).toBe("DONE");
		});
		expect(counter.calls("issues")).toBe(2);
		await act(() => other());
		expect(counter.calls("issues")).toBe(2);
	});

	it("invalidate every read query by default, and never a server's", async () => {
		const counter = counted();
		const active = testClient({ features: [invalidateOnAction()] });
		const named = testClient({
			features: [invalidateOnAction({ default: "none" })],
		});
		const server = testClient({
			features: [invalidateOnAction()],
			isServer: true,
		});
		await counter.show(active, "active");
		await counter.show(named, "named");
		await counter.show(testClient(), "unregistered");
		await counter.show(server, "server");
		await act(() => action(async () => {})());

		expect(
			["active", "named", "unregistered", "server"].map(counter.calls),
		).toEqual([2, 1, 1, 1]);
	});

	it("reach only their client when bound to one", async () => {
		const counter = counted();
		const bound = testClient({ features: [invalidateOnAction()] });
		await counter.show(bound, "bound");
		await counter.show(
			testClient({ features: [invalidateOnAction()] }),
			"other",
		);
		await act(() => action(async () => {}, { client: bound })());

		expect(counter.calls("bound")).toBe(2);
		expect(counter.calls("other")).toBe(1);
	});
});
