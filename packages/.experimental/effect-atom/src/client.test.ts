import { Data, Effect } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, test, vi } from "vitest";

import { QueryClient } from "./client.ts";
import { queryOptions } from "./options.ts";
import { createBackend, flush } from "./test-utils.tsx";
import { promiseFor } from "./thenable.ts";

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

describe("undefined data", () => {
	function maybeQuery() {
		return queryOptions({
			queryFn: (): Promise<number | undefined> => Promise.resolve(undefined),
			queryKey: ["maybe"],
			staleTime: Infinity,
		});
	}

	test("is data like any other value", async () => {
		const queryFn = vi.fn(() => Promise.resolve(undefined));
		const client = new QueryClient({ isServer: false });
		function noneQuery() {
			return queryOptions({ queryFn, queryKey: ["none"], staleTime: Infinity });
		}

		await expect(client.fetch(noneQuery)).resolves.toBeUndefined();
		await expect(client.ensure(noneQuery)).resolves.toMatchObject({
			ensured: true,
		});
		const entry = client.effect.getQueryUnsafe(noneQuery);
		expect(promiseFor(entry, client.registry.get(entry.read))).toMatchObject({
			status: "fulfilled",
			value: undefined,
		});
		expect(queryFn).toHaveBeenCalledOnce();
	});

	test("can be written with setData", async () => {
		const client = new QueryClient({ isServer: false });
		client.setData(maybeQuery, undefined, undefined);
		await expect(client.fetch(maybeQuery)).resolves.toBeUndefined();
	});
});

describe("on the server", () => {
	test("invalidate refetches read entries", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		const unmount = client.registry.mount(
			client.atom(backend.issueQuery, { id: 1 }),
		);
		await backend.respond();

		const invalidated = client.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(2);
		backend.issues.set(1, { assigneeId: 10, id: 1, title: "Edited" });
		await backend.respond();
		await invalidated;

		expect(client.getData(backend.issueQuery, { id: 1 })?.title).toBe("Edited");
		unmount();
	});

	test("verbs refetch unread entries invalidate marked", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		client.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 1, id: 1, title: "A" },
		);

		await client.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(0);

		client.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.calls()).toBe(1);
	});
});

describe("read", () => {
	test("creates a new fulfilled promise per data version", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const input = { id: 1 };
		client.setData(backend.issueQuery, input, {
			assigneeId: 1,
			id: 1,
			title: "A",
		});
		const entry = client.effect.getQueryUnsafe(backend.issueQuery, input);
		const read = () => promiseFor(entry, client.registry.get(entry.read));
		const before = read();
		expect(read()).toBe(before);

		client.setData(backend.issueQuery, input, (issue) => ({
			assigneeId: 1,
			id: 1,
			title: `${issue?.title}B`,
		}));

		expect(read()).not.toBe(before);
		expect(read()).toMatchObject({
			status: "fulfilled",
			value: { title: "AB" },
		});
	});
});

describe("structural sharing", () => {
	function listQuery(options: { structuralSharing?: boolean } = {}) {
		return () =>
			queryOptions({
				queryFn: () => [
					{ id: 1, tags: ["a"], title: "First" },
					{ id: 2, tags: ["b"], title: "Second" },
				],
				queryKey: ["list"],
				...options,
			});
	}

	function promiseOf(
		client: QueryClient,
		factory: ReturnType<typeof listQuery>,
	) {
		const entry = client.effect.getQueryUnsafe(factory);
		return promiseFor(entry, client.registry.get(entry.read));
	}

	test("keeps the data and promise when a refetch returns equal data", async () => {
		const client = new QueryClient({ isServer: false });
		const factory = listQuery();
		const data = await client.fetch(factory);
		const promise = promiseOf(client, factory);

		await client.effect.getQueryUnsafe(factory).refetch();

		expect(client.getData(factory)).toBe(data);
		expect(promiseOf(client, factory)).toBe(promise);
	});

	test("reuses unchanged parts of new data", async () => {
		const client = new QueryClient({ isServer: false });
		const factory = listQuery();
		const data = await client.fetch(factory);
		const promise = promiseOf(client, factory);

		client.setData(factory, undefined, [
			{ id: 1, tags: ["a"], title: "First" },
			{ id: 2, tags: ["b"], title: "Renamed" },
		]);

		const next = client.getData(factory);
		expect(next).not.toBe(data);
		expect(next?.[0]).toBe(data[0]);
		expect(next?.[1]).not.toBe(data[1]);
		expect(next?.[1]?.tags).toBe(data[1]?.tags);
		expect(promiseOf(client, factory)).not.toBe(promise);
	});

	test("is skipped with structuralSharing: false", async () => {
		const client = new QueryClient({ isServer: false });
		const factory = listQuery({ structuralSharing: false });
		const data = await client.fetch(factory);

		await client.effect.getQueryUnsafe(factory).refetch();

		expect(client.getData(factory)).not.toBe(data);
	});
});

describe("invalidate, while a request is in flight", () => {
	test("restarts a read query's request and aborts the old one", async () => {
		const signals: Array<AbortSignal> = [];
		function slowQuery() {
			return queryOptions({
				queryFn: (context) => {
					signals.push(context.signal);
					return new Promise<string>(() => {});
				},
				queryKey: ["slow"],
			});
		}
		const client = new QueryClient({ isServer: false });
		const unmount = client.registry.mount(client.atom(slowQuery));

		void client.invalidate(slowQuery);

		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
		unmount();
	});
});
