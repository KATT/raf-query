import { describe, expect, it, vi } from "vitest";

import { action, invalidateOnAction } from "./action.ts";
import { feature, mount } from "./client.ts";
import {
	entryOf,
	fetchEntry,
	isStale,
	remove,
	subscribeEntry,
} from "./entry.ts";
import { focusRefetch, polling, reconnectRefetch } from "./features.ts";
import { queryOptions } from "./options.ts";
import { recommended } from "./presets.ts";
import {
	createBackend,
	flush,
	issues,
	testClient,
	advance,
} from "./test-utils.ts";

function browser() {
	const window = new EventTarget();
	const document = Object.assign(new EventTarget(), {
		visibilityState: "visible",
	});
	vi.stubGlobal("window", window);
	vi.stubGlobal("document", document);
	return { document, window };
}

function counter(options?: { readonly refetchInterval?: number }) {
	let calls = 0;
	const factory = () =>
		queryOptions({
			meta: options,
			queryFn: () => {
				calls += 1;
				return calls;
			},
			queryKey: [issues, "count"],
		});
	return { calls: () => calls, factory };
}

describe("focusRefetch", () => {
	it("refetches read, stale queries when the window regains focus", async () => {
		const globals = browser();
		const client = testClient({ features: [focusRefetch()] });
		using _mounted = { [Symbol.dispose]: mount(client) };
		const source = counter();
		const read = entryOf(client, source.factory, undefined);
		await fetchEntry(read);
		using _reader = { [Symbol.dispose]: subscribeEntry(read, () => {}) };
		globals.window.dispatchEvent(new Event("focus"));

		expect(source.calls()).toBe(2);
		globals.document.visibilityState = "hidden";
		globals.document.dispatchEvent(new Event("visibilitychange"));
		expect(source.calls()).toBe(2);
	});

	it("leaves unread and disabled queries alone", async () => {
		const globals = browser();
		const client = testClient({ features: [focusRefetch()] });
		using _mounted = { [Symbol.dispose]: mount(client) };
		const source = counter();
		await fetchEntry(entryOf(client, source.factory, undefined));
		globals.window.dispatchEvent(new Event("focus"));

		expect(source.calls()).toBe(1);
	});
});

describe("reconnectRefetch", () => {
	it("refetches read, stale queries when the browser comes back online", async () => {
		const globals = browser();
		const client = testClient({ features: [reconnectRefetch()] });
		using _mounted = { [Symbol.dispose]: mount(client) };
		const source = counter();
		const read = entryOf(client, source.factory, undefined);
		await fetchEntry(read);
		using _reader = { [Symbol.dispose]: subscribeEntry(read, () => {}) };
		globals.window.dispatchEvent(new Event("online"));

		expect(source.calls()).toBe(2);
	});
});

describe("polling", () => {
	it("refetches read queries every refetchInterval", async () => {
		const client = testClient({ features: [polling()] });
		const source = counter({ refetchInterval: 100 });
		const entry = entryOf(client, source.factory, undefined);
		const stop = mount(client);
		const reader = subscribeEntry(entry, () => {});
		const second = subscribeEntry(entry, () => {});
		second();
		advance(client, 100);
		await flush();
		advance(client, 100);

		expect(source.calls()).toBe(2);
		reader();
		advance(client, 500);
		expect(source.calls()).toBe(2);
		subscribeEntry(entry, () => {});
		stop();
		advance(client, 500);
		expect(source.calls()).toBe(2);
	});

	it("picks up queries that were read before it started, and stops for removed ones", () => {
		const client = testClient({ features: [polling()] });
		const source = counter({ refetchInterval: 100 });
		const entry = entryOf(client, source.factory, undefined);
		subscribeEntry(entry, () => {});
		using _mounted = { [Symbol.dispose]: mount(client) };
		advance(client, 100);

		expect(source.calls()).toBe(1);
		remove(entry);
		advance(client, 500);
		expect(source.calls()).toBe(1);
	});

	it("leaves queries without an interval alone, next to declaration-only features", () => {
		const client = testClient({ features: [polling(), feature()] });
		const source = counter();
		subscribeEntry(entryOf(client, source.factory, undefined), () => {});
		using _mounted = { [Symbol.dispose]: mount(client) };
		advance(client, 500);

		expect(source.calls()).toBe(0);
	});
});

describe("action", () => {
	it("invalidates what it names, and resolves after the refetches", async () => {
		const backend = createBackend();
		const client = testClient({ features: [invalidateOnAction()] });
		using _mounted = { [Symbol.dispose]: mount(client) };
		const entry = entryOf(client, backend.issueQuery, { id: 1 });
		const first = fetchEntry(entry);
		backend.respondAll();
		await first;
		using _reader = { [Symbol.dispose]: subscribeEntry(entry, () => {}) };
		const rename = action(
			async (title: string) => {
				backend.store.set(1, { author: "ada", id: 1, title });
				return title.length;
			},
			{ invalidates: [issues] },
		);
		const running = rename("Renamed");
		await flush();
		backend.respondAll();

		await expect(running).resolves.toBe(7);
		expect(entry.state.data).toMatchObject({ title: "Renamed" });
	});

	it("invalidates everything by default, or nothing when told", async () => {
		const busting = testClient({
			features: [invalidateOnAction()],
			staleTime: Infinity,
		});
		const quiet = testClient({
			features: [invalidateOnAction({ default: "none" })],
			staleTime: Infinity,
		});
		using _busting = { [Symbol.dispose]: mount(busting) };
		using _quiet = { [Symbol.dispose]: mount(quiet) };
		const source = counter();
		const loud = entryOf(busting, source.factory, undefined);
		const calm = entryOf(quiet, source.factory, undefined);
		await Promise.all([fetchEntry(loud), fetchEntry(calm)]);
		await action(async () => {})();

		expect([isStale(loud), isStale(calm)]).toEqual([true, false]);
	});

	it("does nothing for clients that didn't opt in", async () => {
		const client = testClient({ staleTime: Infinity });
		const source = counter();
		const entry = entryOf(client, source.factory, undefined);
		await fetchEntry(entry);
		await action(async () => {})();

		expect(isStale(entry)).toBe(false);
	});
});

describe("recommended", () => {
	it("bundles the common links and features", () => {
		const preset = recommended();

		expect(preset.links).toHaveLength(1);
		expect(preset.features).toHaveLength(4);
	});
});
