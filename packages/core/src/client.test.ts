/**
 * `createQueryClient()` with no config: the system clock, a 5-minute
 * `gcTime`, and cache events through `client.subscribe`. Its parts give
 * every `queryFn` their context, wrap every request in array order, and
 * read the client's `defaults` under each query's own options.
 */
import { describe, expect, it, vi } from "vitest";

import {
	bindInfiniteQueryOptions,
	bindQueryOptions,
	createQueryClient,
	getData,
	infiniteQueryOptions,
	load,
	part,
	prefetch,
	type QueryClient,
	queryOptions,
	retry,
	swr,
} from "./index.ts";
import { down, flush, issues, loadOne, testClient } from "./test-utils.ts";

const count = (input: { readonly name: string }) =>
	queryOptions({ queryFn: async () => 1, queryKey: issues("count", input) });

describe("a client with the defaults", () => {
	it("runs on the real clock and drops unread data after five minutes", async () => {
		vi.useFakeTimers();
		const client = createQueryClient();
		await load(client, { count: prefetch(count, { name: "a" }) });
		await vi.advanceTimersByTimeAsync(0);

		expect(client.isServer).toBe(false);
		expect(getData(client, count, { name: "a" })).toBe(1);
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
		expect(getData(client, count, { name: "a" })).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(getData(client, count, { name: "a" })).toBeUndefined();
		vi.useRealTimers();
	});
});

describe("a client's parts", () => {
	interface Session {
		readonly context: { readonly user: string };
	}
	const session = (user: string) => part<Session>({ context: { user } });

	it("give every queryFn their context, plain or paged, one per client", async () => {
		const sessionQueryOptions = bindQueryOptions<Session>();
		const sessionInfiniteQueryOptions = bindInfiniteQueryOptions<Session>();
		const whoAmI = () =>
			sessionQueryOptions({
				queryFn: (context) => context.user,
				queryKey: issues("whoAmI"),
			});
		const pages = () =>
			sessionInfiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: (context) => `${context.user}'s page ${context.pageParam}`,
				queryKey: issues("pages"),
			});
		// One session per query client, as a server keeps one per request.
		const ada = createQueryClient({ isServer: true, parts: [session("ada")] });
		const bob = createQueryClient({ isServer: true, parts: [session("bob")] });
		const [, adas] = await load(ada, { me: swr(whoAmI), pages: swr(pages) });
		const [, bobs] = await load(bob, { me: swr(whoAmI), pages: swr(pages) });

		expect([adas.me, adas.pages.pages]).toEqual(["ada", ["ada's page 0"]]);
		expect([bobs.me, bobs.pages.pages]).toEqual(["bob", ["bob's page 0"]]);
		expect([ada.context, bob.context]).toEqual([
			{ user: "ada" },
			{ user: "bob" },
		]);
	});

	it("wrap every request outermost first, skipping the parts without a link", async () => {
		const order: Array<string> = [];
		const named = (name: string) =>
			part({
				link: async (op, next) => {
					order.push(`${name} in`);
					const result = await next(op);
					order.push(`${name} out`);
					return result;
				},
			});
		const client = createQueryClient({
			parts: [
				named("outer"),
				part(),
				part({ setup: () => {} }),
				named("inner"),
			],
		});
		await load(client, { count: swr(count, { name: "ordered" }) });

		expect(order).toEqual(["outer in", "inner in", "inner out", "outer out"]);
	});

	it("read the client's defaults for an option a query doesn't set", async () => {
		interface Labelled {
			readonly options: { readonly label?: string };
		}
		const labels: Array<string | undefined> = [];
		const labelled = part<Labelled>({
			link: (op, next) => {
				labels.push(op.options.label);
				return next(op);
			},
		});
		const makeClient = () =>
			createQueryClient({
				defaults: { label: "default" },
				parts: [labelled],
			});
		const labelledQueryOptions = bindQueryOptions<typeof makeClient>();
		const query = (input: { readonly label?: string }) =>
			labelledQueryOptions({
				...input,
				queryFn: () => 1,
				queryKey: issues("labelled", input),
			});
		const client = makeClient();
		await load(client, {
			own: swr(query, { label: "own" }),
			unset: swr(query, {}),
		});

		expect(labels).toEqual(["own", "default"]);
	});

	it("take a built-in part's option as a default too", async () => {
		let attempts = 0;
		const failing = () =>
			queryOptions({
				queryFn: async () => {
					attempts += 1;
					throw down;
				},
				queryKey: issues("failing-by-default"),
			});
		const client = testClient({
			defaults: { retry: false },
			parts: [retry({ delay: () => 0 })],
		});
		const outcome = await loadOne(client, swr(failing));
		await flush();

		expect(outcome.error).toBe(down);
		expect(attempts).toBe(1);
	});
});

describe("the client making a request", () => {
	it("is in the queryFn's context, plain or paged", async () => {
		const seen: Array<QueryClient> = [];
		const plain = () =>
			queryOptions({
				queryFn: (context) => seen.push(context.client),
				queryKey: issues("client"),
			});
		const pages = () =>
			infiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: (context) => seen.push(context.client),
				queryKey: issues("client-pages"),
			});
		const client = createQueryClient({ isServer: true });
		await load(client, { pages: swr(pages), plain: swr(plain) });

		expect(seen).toEqual([client, client]);
	});
});

describe("cache events", () => {
	it("reach a subscriber until it unsubscribes, and never one that subscribed aborted", async () => {
		const client = createQueryClient();
		const seen: Array<string> = [];
		const controller = new AbortController();
		const unsubscribe = client.subscribe((event) => seen.push(event.type), {
			signal: controller.signal,
		});
		client.subscribe(() => seen.push("aborted"), {
			signal: AbortSignal.abort(),
		})();
		await load(client, { a: prefetch(count, { name: "a" }) });
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		unsubscribe();
		const before = [...seen];
		await load(client, { b: prefetch(count, { name: "b" }) });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(before).toEqual(["added", "updated", "updated"]);
		expect(seen).toEqual(before);
	});

	it("start with every cached entry for a subscriber that asks to replay them", async () => {
		const client = createQueryClient();
		await load(client, {
			a: prefetch(count, { name: "a" }),
			b: prefetch(count, { name: "b" }),
		});
		const replayed: Array<string> = [];
		client.subscribe(
			(event) =>
				replayed.push(`${event.type} ${JSON.stringify(event.entry.key[2])}`),
			{ replay: true },
		);
		client.subscribe(() => replayed.push("aborted"), {
			replay: true,
			signal: AbortSignal.abort(),
		});
		await load(client, { c: prefetch(count, { name: "c" }) });

		expect(replayed.slice(0, 3)).toEqual([
			'added {"name":"a"}',
			'added {"name":"b"}',
			'added {"name":"c"}',
		]);
		expect(replayed).not.toContain("aborted");
	});
});
