import { describe, expect, it, vi } from "vitest";

import { entryOf, fetchEntry, remove } from "./entry.ts";
import { QueryTimeoutError, retry, timeout } from "./links.ts";
import { queryOptions } from "./options.ts";
import { flush, issues, testClient, advance, timersOf } from "./test-utils.ts";

function flaky(
	failures: number,
	options: { readonly retry?: false | number } = {},
) {
	let calls = 0;
	const factory = () =>
		queryOptions({
			meta: options,
			queryFn: () => {
				calls += 1;
				if (calls <= failures) {
					throw new Error(`failure ${calls}`);
				}
				return calls;
			},
			queryKey: [issues, "flaky"],
		});
	return { calls: () => calls, factory };
}

describe("retry", () => {
	it("retries with growing delays", async () => {
		const client = testClient({ links: [retry()] });
		const source = flaky(2);
		const done = fetchEntry(entryOf(client, source.factory, undefined));
		await flush();

		expect(source.calls()).toBe(1);
		advance(client, 1000);
		await flush();
		expect(source.calls()).toBe(2);
		advance(client, 1999);
		await flush();
		expect(source.calls()).toBe(2);
		advance(client, 1);
		await expect(done).resolves.toEqual({ ok: true });
	});

	it("gives up after its attempts", async () => {
		const client = testClient({
			links: [retry({ attempts: 1, delay: () => 10 })],
		});
		const source = flaky(5);
		const done = fetchEntry(entryOf(client, source.factory, undefined));
		await flush();
		advance(client, 10);

		await expect(done).resolves.toMatchObject({ ok: false });
		expect(source.calls()).toBe(2);
	});

	it("follows a query's own retry option, and its predicate", async () => {
		const client = testClient({ links: [retry({ when: () => false })] });
		const never = flaky(1, { retry: false });
		const skipped = flaky(1);

		await expect(
			fetchEntry(entryOf(client, never.factory, undefined)),
		).resolves.toMatchObject({
			ok: false,
		});
		expect(never.calls()).toBe(1);
		const other = testClient({ links: [retry({ when: () => false })] });
		await fetchEntry(entryOf(other, skipped.factory, undefined));
		expect(skipped.calls()).toBe(1);
	});

	it("never retries on the server", async () => {
		const client = testClient({ isServer: true, links: [retry()] });
		const source = flaky(1);

		await expect(
			fetchEntry(entryOf(client, source.factory, undefined)),
		).resolves.toMatchObject({
			ok: false,
		});
	});

	it("stops waiting when the request is aborted", async () => {
		const client = testClient({ links: [retry()] });
		const source = flaky(1);
		const entry = entryOf(client, source.factory, undefined);
		void fetchEntry(entry);
		await flush();
		remove(entry);
		advance(client, 1000);
		await flush();

		expect(source.calls()).toBe(1);
	});

	it("waits to be online before retrying", async () => {
		const events = new EventTarget();
		vi.stubGlobal("navigator", { onLine: false });
		vi.stubGlobal("window", events);
		const client = testClient({ links: [retry({ delay: () => 0 })] });
		const source = flaky(1);
		const done = fetchEntry(entryOf(client, source.factory, undefined));
		await flush();
		advance(client, 0);
		await flush();

		expect(source.calls()).toBe(1);
		events.dispatchEvent(new Event("online"));
		await expect(done).resolves.toEqual({ ok: true });
	});
});

describe("timeout", () => {
	it("fails and aborts a slow request", async () => {
		const client = testClient({ links: [timeout(100)] });
		let signal: AbortSignal | undefined;
		const slow = () =>
			queryOptions({
				queryFn: (context) => {
					signal = context.signal;
					return new Promise<number>(() => {});
				},
				queryKey: [issues, "slow"],
			});
		const done = fetchEntry(entryOf(client, slow, undefined));
		advance(client, 100);
		const outcome = await done;

		expect(outcome.ok ? undefined : outcome.error).toBeInstanceOf(
			QueryTimeoutError,
		);
		expect(signal?.aborted).toBe(true);
	});

	it("lets fast requests through and clears its timer", async () => {
		const client = testClient({ links: [timeout(100)] });
		const fast = () =>
			queryOptions({ queryFn: () => 1, queryKey: [issues, "fast"] });

		await expect(fetchEntry(entryOf(client, fast, undefined))).resolves.toEqual(
			{ ok: true },
		);
		expect(timersOf(client)).toBe(1);
	});
});
