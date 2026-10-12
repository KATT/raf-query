import {
	infiniteQueryOptions,
	type QueryOptions,
	queryOptions,
} from "@raf-query/core";
import { Data, Effect } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, test } from "vitest";

import { unsafeCast } from "./cast.ts";
import { QueryClient } from "./client.ts";
import { createBackend, flush } from "./test-utils.tsx";

function wait(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

describe("prefetch / ensure / fetch", () => {
	test("ensure waits on a miss and shares the request", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		expect(handle).toEqual({ input: { id: 1 }, key: ["issue", 1] });
		const ensured = client.ensure(backend.issueQuery, { id: 1 });
		const data = client.fetch(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(1);
		await backend.respond();
		await expect(ensured).resolves.toEqual({ ...handle, ensured: true });
		await expect(data).resolves.toMatchObject({ title: "First" });
	});

	test("fresh data isn't refetched", async () => {
		const backend = createBackend();
		const client = new QueryClient({
			defaults: { staleTime: Infinity },
			isServer: false,
		});
		client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		client.prefetch(backend.issueQuery, { id: 1 });
		await client.ensure(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(1);
	});

	test("stale data resolves right away and revalidates", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		backend.issues.set(1, { assigneeId: 10, id: 1, title: "Edited" });
		await expect(
			client.fetch(backend.issueQuery, { id: 1 }),
		).resolves.toMatchObject({ title: "First" });
		expect(backend.calls()).toBe(2);
		await backend.respond();
		expect(client.getData(backend.issueQuery, { id: 1 })?.title).toBe("Edited");
	});

	test("ensure rejects with the request's error", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const [rejection] = await Promise.all([
			client
				.ensure(backend.issueQuery, { id: 404 })
				.catch((error: unknown) => error),
			backend.respond(),
		]);
		expect(rejection).toEqual(new Error("No issue 404"));
	});

	test("an Effect queryFn fails with its typed error", async () => {
		class NotFound extends Data.TaggedError("NotFound")<{
			readonly id: number;
		}> {}
		function itemQuery(input: { id: number }) {
			return queryOptions({
				queryFn: () => Effect.fail(new NotFound({ id: input.id })),
				queryKey: ["item", input.id],
				retry: false,
			});
		}
		const client = new QueryClient({ isServer: false });
		await expect(client.fetch(itemQuery, { id: 7 })).rejects.toBeInstanceOf(
			NotFound,
		);
	});

	test("retries per the query's policy", async () => {
		let attempts = 0;
		function flakyQuery() {
			return queryOptions({
				queryFn: () => {
					attempts++;
					return attempts < 3
						? Promise.reject(new Error("flaky"))
						: Promise.resolve("ok");
				},
				queryKey: ["flaky"],
				retry: 2,
				retryDelay: 0,
			});
		}
		const client = new QueryClient({ isServer: false });
		await expect(client.fetch(flakyQuery)).resolves.toBe("ok");
		expect(attempts).toBe(3);
	});

	test("server clients don't retry or revalidate", async () => {
		let attempts = 0;
		function failingQuery() {
			return queryOptions({
				queryFn: () => {
					attempts++;
					return Promise.reject(new Error("down"));
				},
				queryKey: ["failing"],
			});
		}
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		await expect(client.fetch(failingQuery)).rejects.toThrow("down");
		expect(attempts).toBe(1);
		client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		client.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(1);
	});

	test("paged factories are rejected", () => {
		const client = new QueryClient({ isServer: false });
		const pagedQuery = () =>
			infiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: () => [],
				queryKey: ["paged"],
			});
		// SAFETY: the type rejects paged factories; this checks the runtime guard.
		const factory = unsafeCast<() => QueryOptions<unknown>>(pagedQuery);
		expect(() => client.prefetch(factory)).toThrow(/paged/);
	});
});

describe("setData / getData", () => {
	test("write and read without fetching", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		expect(client.getData(backend.issueQuery, { id: 1 })).toBeUndefined();
		client.setData(
			backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 1,
				id: 1,
				title: "Set",
			},
		);
		client.setData(backend.issueQuery, { id: 1 }, (previous) => ({
			assigneeId: 1,
			id: 1,
			title: `${previous?.title} again`,
		}));
		expect(client.getData(backend.issueQuery, { id: 1 })?.title).toBe(
			"Set again",
		);
		expect(backend.calls()).toBe(0);
	});
});

describe("invalidate", () => {
	test("an unread query refetches on its next prefetch", async () => {
		const backend = createBackend();
		const client = new QueryClient({
			defaults: { staleTime: Infinity },
			isServer: false,
		});
		client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		await client.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(1);
		client.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(2);
	});

	test("a read query refetches, and invalidate waits for it", async () => {
		const backend = createBackend();
		const client = new QueryClient({
			defaults: { staleTime: Infinity },
			isServer: false,
		});
		const atom = client.atom(backend.issueQuery, { id: 1 });
		const seen: Array<boolean> = [];
		const unsubscribe = client.registry.subscribe(
			atom,
			(result) => {
				seen.push(result.waiting);
			},
			{ immediate: true },
		);
		await backend.respond();
		let done = false;
		const invalidated = client
			.invalidate(backend.issueQuery, { id: 1 })
			.then(() => {
				done = true;
			});
		expect(backend.calls()).toBe(2);
		await flush();
		expect(done).toBe(false);
		await backend.respond();
		await invalidated;
		expect(seen).toEqual([true, false, true, false]);
		unsubscribe();
	});
});

describe("atoms", () => {
	test("a query is an atom other atoms and Effects can read", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const issue = client.atom(backend.issueQuery, { id: 1 });
		const title = Atom.make((get) =>
			AsyncResult.map(get(issue), (data) => data.title.toUpperCase()),
		);
		const titles = Effect.runPromise(
			AtomRegistry.getResult(client.registry, title),
		);
		expect(backend.calls()).toBe(1);
		await backend.respond();
		await expect(titles).resolves.toBe("FIRST");
	});

	test("an unread query leaves the registry after gcTime", async () => {
		const backend = createBackend();
		const client = new QueryClient({
			defaults: { gcTime: 20 },
			isServer: false,
			registry: AtomRegistry.make({ timeoutResolution: 5 }),
		});
		client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		expect(client.getData(backend.issueQuery, { id: 1 })).toBeDefined();
		await wait(60);
		expect(client.getData(backend.issueQuery, { id: 1 })).toBeUndefined();
	});
});
